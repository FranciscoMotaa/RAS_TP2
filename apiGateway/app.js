var createError = require("http-errors");
var express = require("express");
var cors = require("cors"); // Import cors
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var projectsRouter = require("./routes/projects");
var usersRouter = require("./routes/users");
var subscriptionsRouter = require("./routes/subscriptions");
const jwt = require('jsonwebtoken');
const SHARE_SECRET = process.env.SHARE_SECRET || 'segredo_super_secreto_mudar_em_prod';
var app = express();

// Enable CORS for all routes
app.use(cors());

// If a share token is present (header or query), normalize it and inject owner into params
app.use('/projects', (req, res, next) => {
  try {
    let st = req.headers['x-share-token'] || (req.query && (req.query.token || req.query.shareToken));
    if (st && typeof st === 'string') {
      st = st.trim().replace(/^\"|\"$/g, '');
      try {
        const decoded = jwt.verify(st, SHARE_SECRET);
        if (decoded && decoded.type === 'share_link' && decoded.owner) {
          req.params = req.params || {};
          req.params.user = decoded.owner;
          // also set Authorization so downstream auth middleware treats it as a bearer token
          req.headers['authorization'] = `Bearer ${st}`;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return next();
});

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/projects", projectsRouter);
app.use("/users", usersRouter);
app.use("/subscriptions", subscriptionsRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500).jsonp(err);
});

module.exports = app;
