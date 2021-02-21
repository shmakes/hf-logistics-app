/**
 * Required External Modules
 */

const express = require("express");
const path = require("path");
const { auth, requiresAuth } = require("express-openid-connect");
const got = require("got");

require("dotenv").config();

/**
 * App Variables
 */

const env = process.env.NODE_ENV || "development";
const app = express();
const port =
  env === "development" ? process.env.DEV_PORT : process.env.PROD_PORT;

/**
 *  App Configuration
 */

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.json());
app.use(
  auth({
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
    baseURL: process.env.BASE_URL,
    clientID: process.env.AUTH0_CLIENT_ID,
    secret: process.env.SESSION_SECRET,
    authRequired: false,
    auth0Logout: true,
    clientSecret: process.env.CLIENT_SECRET,
    authorizationParams: {
      response_type: "code",
      audience: process.env.AUTH0_AUDIENCE,
    },
  })
);

app.use((req, res, next) => {
  res.locals.isAuthenticated = req.oidc.isAuthenticated();
  res.locals.activeRoute = req.originalUrl;
  next();
});

/**
 * Routes Definitions
 */

// > Home

app.get("/", (req, res) => {
  res.render("home");
});

// > Profile

app.get("/profile", requiresAuth(), (req, res) => {
  res.render("profile", {
    user: req.oidc.user,
  });
});

// > External API

app.get("/external-api", (req, res) => {
  res.render("external-api");
});

app.get("/external-api/public-message", async (req, res) => {
  let message;

  try {
    const body = await got(
      `${process.env.SERVER_URL}/hf_start`
    ).json();

    message = body;
  } catch (e) {
    message = "Unable to retrieve message.";
  }

  res.render("external-api", { message });
});

app.get("/external-api/protected-message", requiresAuth(), async (req, res) => {
  const { token_type, access_token } = req.oidc.accessToken;
  let message;

  try {
    const body = await got(
      `${process.env.ADMIN_PROTOCOL}${process.env.ADMIN_AUTH}${process.env.ADMIN_HOST}/hf`
    ).json();

    message = body;
  } catch (e) {
    message = "Unable to retrieve message.";
  }

  res.render("external-api", { message });
});

// > Proxy API

app.get("/_session", requiresAuth(), async (req, res) => {
  let path = req.originalUrl;
  console.log("GET session: " + path);

  try {
    const response = await got(
      `${process.env.ADMIN_PROTOCOL}${process.env.ADMIN_AUTH}${process.env.ADMIN_HOST}` + path,
    );

    let session = JSON.parse(response.body);
    if (req.oidc.user.email_verified 
      && req.oidc.user.email.endsWith("starsandstripeshonorflight.org")
      && req.oidc.user.sub.startsWith("google-oauth2")) {
      session.userCtx.name = req.oidc.user.name;
    } else {
      session.userCtx.name = null;
      session.userCtx.roles = [];
    }
    console.log(JSON.stringify(session));

    let headers = {
      "Content-Length": response.headers["content-length"],
      "Content-Type": response.headers["content-type"],
    };

    res.set(headers);
    res.send(session);

  } catch (e) {
    res.sendStatus(500)
  }
});

app.get("/*", requiresAuth(), async (req, res) => {
  let path = req.originalUrl;
  let xhr = req.xhr ? "*" : "";
  console.log("GET" + xhr + ": " + path);

  try {
    const response = await got(
      `${process.env.ADMIN_PROTOCOL}${process.env.ADMIN_AUTH}${process.env.ADMIN_HOST}` + path,
      { responseType: "buffer" }
    );

    let headers = {
      "Content-Length": response.headers["content-length"],
      "Content-Type": response.headers["content-type"],
    };
    if (!xhr) {
      headers["Cache-Control"] = "public, max-age=10800, immutable";
    }

    res.set(headers);
    res.send(response.body);

  } catch (e) {
    res.sendStatus(500)
  }
});

app.put("/*", requiresAuth(), async (req, res) => {
  let path = req.originalUrl;
  let xhr = req.xhr ? "*" : "";
  console.log("PUT" + xhr + ": " + path);

  try {
    const response = await got.put(
      `${process.env.ADMIN_PROTOCOL}${process.env.ADMIN_AUTH}${process.env.ADMIN_HOST}` + path,
      { 
        json: req.body,
        responseType: "buffer" 
      }
    );

    res.set({
      "Content-Length": response.headers["content-length"],
      "Content-Type": response.headers["content-type"],
    });
    res.send(response.body);

  } catch (e) {
    res.sendStatus(500)
  }
});


app.post("/*", requiresAuth(), async (req, res) => {
  let path = req.originalUrl;
  let xhr = req.xhr ? "*" : "";
  console.log("POST" + xhr + ": " + path);

  try {
    const response = await got.post(
      `${process.env.ADMIN_PROTOCOL}${process.env.ADMIN_AUTH}${process.env.ADMIN_HOST}` + path,
      { 
        json: req.body,
        responseType: "buffer" 
      }
    );

    res.set({
      "Content-Length": response.headers["content-length"],
      "Content-Type": response.headers["content-type"],
    });
    res.send(response.body);

  } catch (e) {
    res.sendStatus(500)
  }
});

app.delete("/*", requiresAuth(), async (req, res) => {
  let path = req.originalUrl;
  let xhr = req.xhr ? "*" : "";
  console.log("DELETE" + xhr + ": " + path);

  try {
    const response = await got.delete(
      `${process.env.ADMIN_PROTOCOL}${process.env.ADMIN_AUTH}${process.env.ADMIN_HOST}` + path,
      { responseType: "buffer" }
    );

    res.set({
      "Content-Length": response.headers["content-length"],
      "Content-Type": response.headers["content-type"],
    });
    res.send(response.body);

  } catch (e) {
    res.sendStatus(500)
  }
});


// > Authentication

app.get("/sign-up/:page/:section?", (req, res) => {
  const { page, section } = req.params;

  res.oidc.login({
    returnTo: section ? `${page}/${section}` : page,
    authorizationParams: {
      screen_hint: "signup",
    },
  });
});

app.get("/login/:page/:section?", (req, res) => {
  const { page, section } = req.params;

  res.oidc.login({
    returnTo: section ? `${page}/${section}` : page,
  });
});

app.get("/logout/:page/:section?", (req, res) => {
  const { page } = req.params;

  res.oidc.logout({
    returnTo: page,
  });
});

/**
 * Server Activation
 */

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});
