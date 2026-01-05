var express = require("express");
var router = express.Router();

const axios = require("axios");

const https = require("https");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");

const multer = require("multer");
const FormData = require("form-data");

const auth = require("../auth/auth");

const key = fs.readFileSync(__dirname + "/../certs/selfsigned.key");
const cert = fs.readFileSync(__dirname + "/../certs/selfsigned.crt");

const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // (NOTE: this will disable client verification)
  cert: cert,
  key: key,
});

// In-memory store for consumed single-use share tokens (jti values).
// NOTE: This is volatile and will be lost on restart; use Redis for production.
const consumedShareJtis = new Set();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const projectsURL = "https://projects:9001/";
const SHARE_SECRET = process.env.SHARE_SECRET || 'segredo_super_secreto_mudar_em_prod';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Resolve effective user id for proxying to projects service.
// If the request includes a share token in Authorization header, prefer the owner from that token.
function resolveUserForProxy(req) {
  // Never rewrite the user for list endpoints or project creation (no :project in params)
  // A share link should only grant access to the specific project encoded in the token.
  if (!req.params || !req.params.project) return req.params.user;

  // Helper to validate share token: only use owner if projectId matches requested project
  function validateAndExtractOwner(decoded) {
    if (
      decoded &&
      decoded.type === 'share_link' &&
      decoded.owner &&
      decoded.projectId &&
      String(decoded.projectId) === String(req.params.project)
    ) {
      return decoded.owner;
    }
    return null;
  }

  // Prefer explicit share token string (header or query) and use its owner if valid
  try {
    const st = getShareTokenString(req);
    if (st) {
      const decodedSt = jwt.verify(st, SHARE_SECRET);
      const owner = validateAndExtractOwner(decodedSt);
      if (owner) return owner;
    }
  } catch (_) {}

  // 1) Check Authorization header for a share token
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.split(" ")[1];
    if (token) {
      const decoded = jwt.verify(token, SHARE_SECRET);
      const owner = validateAndExtractOwner(decoded);
      if (owner) return owner;
    }
  } catch (_) {}

  // 2) Check query param `token` (used by share link endpoints)
  try {
    const qtoken = req.query && (req.query.token || req.query.shareToken);
    if (qtoken) {
      const decodedQ = jwt.verify(qtoken, SHARE_SECRET);
      const owner = validateAndExtractOwner(decodedQ);
      if (owner) return owner;
    }
  } catch (_) {}

  // 3) Check custom header `x-share-token`
  try {
    const xToken = req.headers['x-share-token'];
    if (xToken) {
      const decodedX = jwt.verify(xToken, SHARE_SECRET);
      const owner = validateAndExtractOwner(decodedX);
      if (owner) return owner;
    }
  } catch (_) {}

  // 4) Check Referer URL for shareToken query param (frontend may not forward token header)
  try {
    const referer = req.headers.referer || req.headers.referrer;
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const refererToken = refererUrl.searchParams.get('shareToken') || refererUrl.searchParams.get('token');
        if (refererToken) {
          const decodedR = jwt.verify(refererToken, SHARE_SECRET);
          const owner = validateAndExtractOwner(decodedR);
          if (owner) return owner;
        }
      } catch (_) {}
    }
  } catch (_) {}

  return req.params.user;
}

// If verify didn't return an owner, try a safe decode: only accept decoded.owner
// when decoded.projectId equals the requested project (avoids mistaking session JWTs).
function resolveUserForProxySafeDecode(req) {
  try {
    const st = getShareTokenString(req);
    if (!st) return req.params.user;
    const preview = jwt.decode(st);
    if (preview && preview.projectId && String(preview.projectId) === String(req.params.project) && preview.owner)
      return preview.owner;
  } catch (_) {}
  return req.params.user;
}

  // Fallback resolver: try to jwt.decode (no verify) and read owner field
  function resolveUserForProxyWithDecodeFallback(req) {
    try {
      const st = getShareTokenString(req);
      if (st) {
        try {
          const preview = jwt.decode(st);
          if (preview && preview.owner) return preview.owner;
        } catch (_) {}
      }
    } catch (_) {}
    return req.params.user;
  }

// Helper to extract raw share token string from the request (Authorization, query, x-share-token or Referer)
function getShareTokenString(req) {
  // Authorization header
  // explicit header first (prefer explicit share header)
  try {
    if (req.headers['x-share-token']) {
      const raw = req.headers['x-share-token'];
      return typeof raw === 'string' ? raw.trim().replace(/^"|"$/g, '') : raw;
    }
  } catch (_) {}

  // query param next
  try {
    const q = req.query && (req.query.token || req.query.shareToken);
    if (q) return q;
  } catch (_) {}

  // Authorization header last
  try {
    const authHeader = req.headers['authorization'] || '';
    const maybe = authHeader.split(' ')[1];
    if (maybe) return maybe;
  } catch (_) {}

  // referer URL
  try {
    const referer = req.headers.referer || req.headers.referrer;
    if (referer) {
      const url = new URL(referer);
      const t = url.searchParams.get('shareToken') || url.searchParams.get('token');
      if (t) return typeof t === 'string' ? t.trim().replace(/^"|"$/g, '') : t;
    }
  } catch (_) {}

  return null;
}

// Build axios options merging httpsAgent and optionally forwarding share token as x-share-token
function axiosProxyOptions(req, extra) {
  const options = Object.assign({}, extra || {});
  options.httpsAgent = httpsAgent;
  options.headers = options.headers || {};
  // Determine where (if anywhere) the incoming share token originated.
  const headerToken = req.headers['x-share-token'];
  const queryToken = req.query && (req.query.token || req.query.shareToken);
  const authHeader = req.headers['authorization'] || '';
  const authToken = authHeader.split(' ')[1];
  const st = headerToken || queryToken || authToken;
  const stSource = headerToken ? 'header' : queryToken ? 'query' : authToken ? 'auth' : null;
  if (st) {
    try {
      const preview = jwt.decode(st);
      try {
        console.log('axiosProxyOptions: found raw share token length=', (st && st.length) || 0, 'previewType=', preview && preview.type, 'previewOwner=', preview && preview.owner, 'source=', stSource);
      } catch (_) {}
      // Forward x-share-token when it looks like a share link token.
      // Prefer explicit tokens from header/query; allow Authorization when
      // it contains a share_link (so frontend can send share token as Bearer).
      const isShare = preview && preview.type === 'share_link' && preview.owner;
      if (isShare && (stSource === 'header' || stSource === 'query' || stSource === 'auth')) {
        options.headers['x-share-token'] = st;
      } else {
        try { console.log('axiosProxyOptions: not forwarding token (not a share_link or not accepted source)'); } catch (_) {}
      }
    } catch (e) {
      try { console.log('axiosProxyOptions: jwt.decode failed', e && e.message); } catch (_) {}
    }
  }
  return options;
}

function axiosGet(req, url, extra) {
  const opts = axiosProxyOptions(req, extra);
  try {
    // If a share token is present, prefer routing to the token owner (decode-only fallback)
    try {
      const st = getShareTokenString(req);
      if (st) {
        try {
          const preview = jwt.decode(st);
          if (preview && preview.owner) {
            // Replace the first user segment in the projects URL with the owner
            url = url.replace(new RegExp(projectsURL + "[^/]+"), projectsURL + preview.owner);
          }
        } catch (_) {}
      }
    } catch (_) {}
    console.log('Proxy GET ->', url, 'x-share-token present=', !!opts.headers['x-share-token']);
  } catch (_) {}
  return axios.get(url, opts);
}

function axiosPost(req, url, data, extra) {
  const opts = axiosProxyOptions(req, extra);
  try {
    try {
      const st = getShareTokenString(req);
      if (st) {
        try {
          const preview = jwt.decode(st);
          if (preview && preview.owner) {
            url = url.replace(new RegExp(projectsURL + "[^/]+"), projectsURL + preview.owner);
          }
        } catch (_) {}
      }
    } catch (_) {}
    console.log('Proxy POST ->', url, 'x-share-token present=', !!opts.headers['x-share-token']);
  } catch (_) {}
  return axios.post(url, data, opts);
}

function axiosPut(req, url, data, extra) {
  const opts = axiosProxyOptions(req, extra);
  try {
    try {
      const st = getShareTokenString(req);
      if (st) {
        try {
          const preview = jwt.decode(st);
          if (preview && preview.owner) {
            url = url.replace(new RegExp(projectsURL + "[^/]+"), projectsURL + preview.owner);
          }
        } catch (_) {}
      }
    } catch (_) {}
    console.log('Proxy PUT ->', url, 'x-share-token present=', !!opts.headers['x-share-token']);
  } catch (_) {}
  return axios.put(url, data, opts);
}

function axiosDelete(req, url, extra) {
  const opts = axiosProxyOptions(req, extra);
  try {
    try {
      const st = getShareTokenString(req);
      if (st) {
        try {
          const preview = jwt.decode(st);
          if (preview && preview.owner) {
            url = url.replace(new RegExp(projectsURL + "[^/]+"), projectsURL + preview.owner);
          }
        } catch (_) {}
      }
    } catch (_) {}
    console.log('Proxy DELETE ->', url, 'x-share-token present=', !!opts.headers['x-share-token']);
  } catch (_) {}
  return axios.delete(url, opts);
}


// TODO Verify jwt

/*
Project structure
{
    "_id": Mongoose.type.id,
    "user_id": Mongoose.type.id,
    "name": String,
    "imgs": [Image Structure],
    "tools": [Tool Structure],
}

Image structure
{
    "_id": Mongoose.type.id,
    "og_uri": String,
    "new_uri": String
}

Tool structure
{
    "_id": Mongoose.type._id,
    "position": Number,
    "procedure": String,
    "params": Object
}

Post answer structure in case of success
{
    "acknowledged": Bool,
    "modifiedCount": Number,
    "upsertedId": null,
    "upsertedCount": Number,
    "matchedCount": Number
}
*/

/**
 * Note: auth.checkToken is a midleware used to verify JWT
 */

// Fetch project by share token (public access using token)
router.get('/share/project', function (req, res, next) {
  const token = req.query.token;
  if (!token) return res.status(400).jsonp({ error: 'Token em falta.' });

  try {
    const decoded = jwt.verify(token, SHARE_SECRET);
    console.log('Decoded share token:', JSON.stringify(decoded));
    if (decoded.type !== 'share_link') return res.status(403).jsonp({ error: 'Token inválido.' });

    // Check single-use token state before proxying
    if (decoded.singleUse && consumedShareJtis.has(decoded.jti)) {
      return res.status(410).jsonp({ error: 'Este link de partilha já foi utilizado.' });
    }

    const targetUrl = projectsURL + `${decoded.owner}/${decoded.projectId}`;
    console.log('Fetching shared project from:', targetUrl);

    // Proxy internal request to projects microservice to fetch project data
    axiosGet(req, targetUrl, { httpsAgent: httpsAgent })
      .then((resp) => {
        // Mark single-use token as consumed only after a successful fetch
        if (decoded.singleUse && decoded.jti) {
          consumedShareJtis.add(decoded.jti);
        }
        // Include owner id so frontend can perform actions on behalf of the original owner
        res.status(200).jsonp({ project: resp.data, permission: decoded.permission, owner: decoded.owner });
      })
      .catch((err) => {
        try {
          console.error('Error fetching project by share token - message:', err && err.message);
          console.error('Error object keys:', Object.getOwnPropertyNames(err));
          if (err && err.config) console.error('Axios config url:', err.config.url);
          if (err && err.response) {
            console.error('Upstream status:', err.response.status);
            console.error('Upstream headers:', err.response.headers);
            console.error('Upstream data:', err.response.data);
          }
          if (err && err.request) console.error('Request made but no response, request keys:', Object.keys(err.request || {}));
          console.error('Full error stack:', err && err.stack ? err.stack : err);
        } catch (logErr) {
          console.error('Error while logging fetch error', logErr);
        }
        res.status(500).jsonp({ error: 'Erro ao obter projeto partilhado' });
      });
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(410).jsonp({ error: 'Este link de partilha expirou.' });
    return res.status(403).jsonp({ error: 'Link de partilha inválido.' });
  }
});

// Fetch processed results (URLs) for a shared project using only the share token
router.get('/share/process/url', function (req, res, next) {
  const token = req.query.token;
  if (!token) return res.status(400).jsonp({ error: 'Token em falta.' });

  try {
    const decoded = jwt.verify(token, SHARE_SECRET);
    if (decoded.type !== 'share_link') return res.status(403).jsonp({ error: 'Token inválido.' });

    const targetUrl = projectsURL + `${decoded.owner}/${decoded.projectId}/process/url`;

    axiosGet(req, targetUrl, { httpsAgent: httpsAgent })
      .then((resp) => {
        res.status(200).send(resp.data);
      })
      .catch((err) => {
        try {
          console.error('Error fetching shared project results - message:', err && err.message);
          if (err && err.response) {
            console.error('Upstream status:', err.response.status);
            console.error('Upstream data:', err.response.data);
          }
        } catch (_) {}
        res.status(500).jsonp({ error: 'Erro ao obter resultados do projeto partilhado' });
      });
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(410).jsonp({ error: 'Este link de partilha expirou.' });
    return res.status(403).jsonp({ error: 'Link de partilha inválido.' });
  }
});

/**
 * Get user's projects
 * @body Empty
 * @returns List of projects, each project has no information about it's images or tools
 */
router.get("/:user", auth.checkToken, function (req, res, next) {
  let proxyUser = resolveUserForProxy(req);
  if (proxyUser === req.params.user) {
    try {
      const st = getShareTokenString(req);
      const preview = st ? jwt.decode(st) : null;
      if (preview && preview.owner) proxyUser = preview.owner;
    } catch (_) {}
  }
  axiosGet(req, projectsURL + `${proxyUser}`, { httpsAgent: httpsAgent })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error getting users"));
});

/**
 * Get user's project
 * @body Empty
 * @returns The required project
 */
router.get("/:user/:project", auth.checkToken, function (req, res, next) {
  let proxyUser = resolveUserForProxy(req);
  if (proxyUser === req.params.user) {
    try {
      const st = getShareTokenString(req);
      const preview = st ? jwt.decode(st) : null;
      if (preview && preview.owner) proxyUser = preview.owner;
    } catch (_) {}
  }
  axiosGet(req, projectsURL + `${proxyUser}/${req.params.project}`, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error getting project"));
});

// Generate share token for a project (requires auth)
router.post('/:user/:project/share', auth.checkToken, function (req, res, next) {
  const permission = req.body.permission;
  const expiresHours = req.body.expiresHours;
  const singleUse = !!req.body.singleUse;

  if (!['view', 'edit'].includes(permission)) {
    return res.status(400).jsonp({ error: "Permissão inválida. Use 'view' ou 'edit'." });
  }

  try {
    // auth.checkToken already validated the JWT and ensured req.params.user matches the token's user.
    // Use the provided user param as owner to avoid re-verifying the token here.
    const owner = req.params.user;

    const jti = randomUUID();
    const hours = typeof expiresHours === 'number' && expiresHours > 0 ? expiresHours : 168;
    const expiresIn = `${hours}h`;

    const payload = {
      owner: owner,
      projectId: req.params.project,
      permission,
      type: 'share_link',
      singleUse,
    };

    console.log('Share link requested - req.body.permission:', req.body.permission, 'payload.permission:', permission);
    const tokenShare = jwt.sign(payload, SHARE_SECRET, { expiresIn, jwtid: jti });
    // Log the token payload (decoded) to help debug permission mismatches
    const decodedPreview = jwt.decode(tokenShare);
    console.log('Signed share token payload preview:', JSON.stringify(decodedPreview));
    const shareLink = `${FRONTEND_URL}/share/access?token=${tokenShare}`;

    res.status(200).jsonp({ success: true, link: shareLink, expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000), singleUse });
  } catch (err) {
    console.error('Error generating share token', err);
    res.status(500).jsonp({ error: 'Erro interno ao gerar link de partilha' });
  }
});

// Fetch project by share token (public access using token)
router.get('/share/project', function (req, res, next) {
  const token = req.query.token;
  if (!token) return res.status(400).jsonp({ error: 'Token em falta.' });

  try {
    const decoded = jwt.verify(token, SHARE_SECRET);
    console.log('Decoded share token:', JSON.stringify(decoded));
    if (decoded.type !== 'share_link') return res.status(403).jsonp({ error: 'Token inválido.' });

    // Check single-use token state before proxying
    if (decoded.singleUse && consumedShareJtis.has(decoded.jti)) {
      return res.status(410).jsonp({ error: 'Este link de partilha já foi utilizado.' });
    }

    const targetUrl = projectsURL + `${decoded.owner}/${decoded.projectId}`;
    console.log('Fetching shared project from:', targetUrl);

    // Proxy internal request to projects microservice to fetch project data
    axios
      .get(targetUrl, { httpsAgent: httpsAgent })
      .then((resp) => {
        // Mark single-use token as consumed only after a successful fetch
        if (decoded.singleUse && decoded.jti) {
          consumedShareJtis.add(decoded.jti);
        }
        res.status(200).jsonp({ project: resp.data, permission: decoded.permission });
      })
      .catch((err) => {
        try {
          console.error('Error fetching project by share token - message:', err && err.message);
          console.error('Error object keys:', Object.getOwnPropertyNames(err));
          if (err && err.config) console.error('Axios config url:', err.config.url);
          if (err && err.response) {
            console.error('Upstream status:', err.response.status);
            console.error('Upstream headers:', err.response.headers);
            console.error('Upstream data:', err.response.data);
          }
          if (err && err.request) console.error('Request made but no response, request keys:', Object.keys(err.request || {}));
          console.error('Full error stack:', err && err.stack ? err.stack : err);
        } catch (logErr) {
          console.error('Error while logging fetch error', logErr);
        }
        res.status(500).jsonp({ error: 'Erro ao obter projeto partilhado' });
      });
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(410).jsonp({ error: 'Este link de partilha expirou.' });
    return res.status(403).jsonp({ error: 'Link de partilha inválido.' });
  }
});

/**
 * Get project image
 * @body Empty
 * @returns The image url
 */
router.get(
  "/:user/:project/img/:img",
  auth.checkToken,
  function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosGet(req, projectsURL + `${proxyUser}/${req.params.project}/img/${req.params.img}`, {
        httpsAgent: httpsAgent,
      })
      .then((resp) => {
        res.status(200).send(resp.data);
      })
      .catch((err) => res.status(500).jsonp("Error getting project image"));
  }
);

/**
 * Get project images
 * @body Empty
 * @returns The project's images
 */
router.get("/:user/:project/imgs", auth.checkToken, function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosGet(req, projectsURL + `${proxyUser}/${req.params.project}/imgs`, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => {
      res.status(200).send(resp.data);
    })
    .catch((err) => res.status(500).jsonp("Error getting project images"));
});

/**
 * Get project's processment result
 * @body Empty
 * @returns The required results, sent as a zip
 */
router.get(
  "/:user/:project/process",
  auth.checkToken,
  function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosGet(req, projectsURL + `${proxyUser}/${req.params.project}/process`, {
        httpsAgent: httpsAgent,
        responseType: "arraybuffer",
      })
      .then((resp) => res.status(200).send(resp.data))
      .catch((err) =>
        res.status(500).jsonp("Error getting processing results file")
      );
  }
);

/**
 * Get project's processment result
 * @body Empty
 * @returns The required results, sent as [{img_id, img_name, url}]
 */
router.get(
  "/:user/:project/process/url",
  auth.checkToken,
  function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosGet(req, projectsURL + `${proxyUser}/${req.params.project}/process/url`, {
          httpsAgent: httpsAgent,
        })
      .then((resp) => {
        res.status(200).send(resp.data);
      })
      .catch((err) =>
        res.status(500).jsonp("Error getting processing results")
      );
  }
);

/**
 * Create new user's project
 * @body { "name": String }
 * @returns Created project's data
 */
router.post("/:user", auth.checkToken, function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosPost(req, projectsURL + `${proxyUser}`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error creating new project"));
});

/**
 * Preview an image in a shared project using only the share token
 * @query token: share token, img: image id
 * @body Empty
 * @returns String indication preview is being processed
 */
router.post('/share/preview/:img', function (req, res, next) {
  const token = req.query.token || req.body.token;
  if (!token) {
    return res.status(400).jsonp({ error: 'Share token is required' });
  }

  try {
    const decoded = jwt.verify(token, SHARE_SECRET);
    if (!decoded.owner || !decoded.projectId) {
      return res.status(403).jsonp({ error: 'Invalid share token' });
    }

    // Verify expiry if present
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return res.status(410).jsonp({ error: 'Share token has expired' });
    }

    // Build internal URL
    const targetUrl = projectsURL + `${decoded.owner}/${decoded.projectId}/preview/${req.params.img}`;
    
    // Forward x-share-token header for the projects service
    const opts = {
      httpsAgent: httpsAgent,
      headers: {
        'x-share-token': token,
      }
    };

    axiosPost(req, targetUrl, req.body, opts)
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) => {
        console.log('Error previewing shared image:', err.message);
        res.status(500).jsonp({ error: 'Error requesting image preview' });
      });
  } catch (err) {
    console.log('Share token verification failed:', err.message);
    res.status(403).jsonp({ error: 'Invalid or expired share token' });
  }
});

/**
 * Preview an image
 * @body Empty
 * @returns String indication preview is being processed
 */
router.post(
  "/:user/:project/preview/:img",
  auth.checkToken,
  function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosPost(req, projectsURL + `${proxyUser}/${req.params.project}/preview/${req.params.img}`, req.body, { httpsAgent: httpsAgent })
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) => {
        console.log(err);
        res.status(500).jsonp("Error requesting image preview");
      });
  }
);

/**
 * Add image to project
 * @body Empty
 * @file Image to be added
 * @returns Post answer structure in case of success
 */
router.post(
  "/:user/:project/img",
  upload.single("image"),
  auth.checkToken,
  function (req, res, next) {
    const data = new FormData();
    data.append("image", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const proxyUser = resolveUserForProxy(req);
    axiosPost(req, projectsURL + `${proxyUser}/${req.params.project}/img`, data, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          httpsAgent: httpsAgent,
        })
      .then((resp) => res.sendStatus(201))
      .catch((err) => {
        if (err.response) {
          return res
            .status(err.response.status)
            .jsonp(err.response.data);
        }

        console.error("Error adding image to project:", err.message || err);
        return res.status(500).jsonp("Error adding image to project");
      });
  }
);

/**
 * Add tool to project
 * @body { "procedure": String, "params": Object }
 * @returns Post answer structure in case of success
 */
router.post("/:user/:project/tool", auth.checkToken, function (req, res, next) {
  let proxyUser = resolveUserForProxy(req);
  if (proxyUser === req.params.user) {
    try {
      const st = getShareTokenString(req);
      const preview = st ? jwt.decode(st) : null;
      if (preview && preview.owner) proxyUser = preview.owner;
    } catch (_) {}
  }
  axiosPost(req, projectsURL + `${proxyUser}/${req.params.project}/tool`, req.body, { httpsAgent: httpsAgent })
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error adding tool to project"));
});

/**
 * Reorder tools of a project
 * @body [{ "position": Number, "procedure": String, "params": Object }] (Position is a unique number between 0 and req.body.length - 1)
 * @returns Post answer structure in case of success
 */
router.post(
  "/:user/:project/reorder",
  auth.checkToken,
  function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosPost(req, projectsURL + `${proxyUser}/${req.params.project}/reorder`, req.body, { httpsAgent: httpsAgent })
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) => res.status(500).jsonp("Error reordering tools"));
  }
);

/**
 * Process a shared project using only the share token (no JWT required)
 * @query token: share token
 * @body Empty
 * @returns String indicating process request has been created
 */
router.post('/share/process', function (req, res, next) {
  const token = req.query.token || req.body.token;
  if (!token) {
    return res.status(400).jsonp({ error: 'Share token is required' });
  }

  try {
    const decoded = jwt.verify(token, SHARE_SECRET);
    if (!decoded.owner || !decoded.projectId) {
      return res.status(403).jsonp({ error: 'Invalid share token' });
    }

    // Verify expiry if present
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return res.status(410).jsonp({ error: 'Share token has expired' });
    }

    // Build internal URL
    const targetUrl = projectsURL + `${decoded.owner}/${decoded.projectId}/process`;
    
    // Forward x-share-token header for the projects service
    const opts = {
      httpsAgent: httpsAgent,
      headers: {
        'x-share-token': token,
      }
    };

    axiosPost(req, targetUrl, req.body, opts)
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) => {
        console.log('Error processing shared project:', err.message);
        res.status(500).jsonp({ error: 'Error requesting project processing' });
      });
  } catch (err) {
    console.log('Share token verification failed:', err.message);
    res.status(403).jsonp({ error: 'Invalid or expired share token' });
  }
});

/**
 * Generate request to process a project
 * @body Empty
 * @returns String indicating process request has been created
 */
router.post(
  "/:user/:project/process",
  auth.checkToken,
  function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosPost(req, projectsURL + `${proxyUser}/${req.params.project}/process`, req.body, { httpsAgent: httpsAgent })
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) =>
        res.status(500).jsonp("Error requesting project processing")
      );
  }
);

/**
 * Update a specific project
 * @body { "name": String }
 * @returns Empty
 */
router.put("/:user/:project", auth.checkToken, function (req, res, next) {
  let proxyUser = resolveUserForProxy(req);
  if (proxyUser === req.params.user) {
    try {
      const st = getShareTokenString(req);
      const preview = st ? jwt.decode(st) : null;
      if (preview && preview.owner) proxyUser = preview.owner;
    } catch (_) {}
  }
  axiosPut(req, projectsURL + `${proxyUser}/${req.params.project}`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((_) => res.sendStatus(204))
    .catch((err) => res.status(500).jsonp("Error updating project details"));
});

/**
 * Update a tool from a project
 * @body { "params" : Object }
 * @returns Empty
 */
router.put(
  "/:user/:project/tool/:tool",
  auth.checkToken,
  function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosPut(req, projectsURL + `${proxyUser}/${req.params.project}/tool/${req.params.tool}`, req.body, { httpsAgent: httpsAgent })
      .then((_) => res.sendStatus(204))
      .catch((err) => res.status(500).jsonp("Error updating tool params"));
  }
);

/**
 * Delete a user's project
 * @body Empty
 * @returns Empty
 */
router.delete("/:user/:project", auth.checkToken, function (req, res, next) {
  let proxyUser = resolveUserForProxy(req);
  if (proxyUser === req.params.user) {
    try {
      const st = getShareTokenString(req);
      const preview = st ? jwt.decode(st) : null;
      if (preview && preview.owner) proxyUser = preview.owner;
    } catch (_) {}
  }
  axiosDelete(req, projectsURL + `${proxyUser}/${req.params.project}`, {
      httpsAgent: httpsAgent,
    })
    .then((_) => res.sendStatus(204))
    .catch((err) => res.status(500).jsonp("Error deleting project"));
});

/**
 * Remove an image from a user's project
 * @body Empty
 * @returns Empty
 */
router.delete(
  "/:user/:project/img/:img",
  auth.checkToken,
  function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosDelete(req, projectsURL + `${proxyUser}/${req.params.project}/img/${req.params.img}`, { httpsAgent: httpsAgent })
      .then((_) => res.sendStatus(204))
      .catch((err) =>
        res.status(500).jsonp("Error deleting image from project")
      );
  }
);

/**
 * Remove a tool from a user's project
 * @body Empty
 * @returns Empty
 */
router.delete(
  "/:user/:project/tool/:tool",
  auth.checkToken,
  function (req, res, next) {
    const proxyUser = resolveUserForProxy(req);
    axiosDelete(req, projectsURL + `${proxyUser}/${req.params.project}/tool/${req.params.tool}`, { httpsAgent: httpsAgent })
      .then((_) => res.sendStatus(204))
      .catch((err) =>
        res.status(500).jsonp("Error removing tool from project")
      );
  }
);

module.exports = router;
