const jwt = require("jsonwebtoken");

module.exports.checkToken = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.split(" ")[1];

    if (!token) {
      res.status(401).jsonp(`Please provide a JWT token`);
      return;
    }

    // First try normal user JWT
    jwt.verify(token, process.env.JWT_SECRET_KEY, (e, payload) => {
      if (!e) {
        try {
          const user = payload;
          const user_id = user.id;
          const exp = user.exp;

          if (Date.now() >= exp * 1000) {
            res.status(401).jsonp(`JWT expired.`);
            return;
          }

          if (user_id !== req.params.user) {
            res.status(401).jsonp(`Request's user and JWT's user don't match`);
            return;
          }

          next();
        } catch (_) {
          res.status(401).jsonp(`Invalid JWT`);
        }
      } else {
        // If normal JWT verification failed, try SHARE token (share links) to allow shared-edit flows.
        jwt.verify(token, process.env.SHARE_SECRET || 'segredo_super_secreto_mudar_em_prod', (se, spayload) => {
          if (se) {
            res.status(401).jsonp(`Invalid JWT signature or token expired.`);
            return;
          }

          try {
            // Share tokens have different shape. Validate type and permission and owner
            if (spayload.type !== 'share_link') {
              res.status(401).jsonp(`Invalid share token`);
              return;
            }

            // Only allow share tokens with edit permission to pass auth middleware for modifying endpoints
            if (spayload.permission !== 'edit') {
              res.status(403).jsonp(`Share token does not have edit permissions`);
              return;
            }

            if (spayload.owner !== req.params.user) {
              res.status(401).jsonp(`Share token owner does not match requested user`);
              return;
            }

            next();
          } catch (_) {
            res.status(401).jsonp(`Invalid share token`);
          }
        });
      }
    });
  } catch (err) {
    res.status(401).jsonp(`Please provide a JWT token`);
  }
};
