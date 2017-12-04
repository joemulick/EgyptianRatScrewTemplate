/**
 * React Starter Kit (https://www.reactstarterkit.com/)
 *
 * Copyright © 2014-present Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

import path from 'path';
import express from 'express';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import expressJwt, { UnauthorizedError as Jwt401Error } from 'express-jwt';
import expressGraphQL from 'express-graphql';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import React from 'react';
import ReactDOM from 'react-dom/server';
import PrettyError from 'pretty-error';
import App from './components/App';
import Html from './components/Html';
import { ErrorPageWithoutStyle } from './routes/error/ErrorPage';
import errorPageStyle from './routes/error/ErrorPage.css';
import createFetch from './createFetch';
import passport from './passport';
import router from './router';
import models from './data/models';
import schema from './data/schema';
import assets from './assets.json'; // eslint-disable-line import/no-unresolved
import config from './config';

const app = express();

//
// Tell any CSS tooling (such as Material UI) to use all vendor prefixes if the
// user agent is not known.
// -----------------------------------------------------------------------------
global.navigator = global.navigator || {};
global.navigator.userAgent = global.navigator.userAgent || 'all';

//
// Register Node.js middleware
// -----------------------------------------------------------------------------
app.use(express.static(path.resolve(__dirname, 'public')));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//
// Authentication
// -----------------------------------------------------------------------------
app.use(
  expressJwt({
    secret: config.auth.jwt.secret,
    credentialsRequired: false,
    getToken: req => req.cookies.id_token,
  }),
);
// Error handler for express-jwt
app.use((err, req, res, next) => {
  // eslint-disable-line no-unused-vars
  if (err instanceof Jwt401Error) {
    console.error('[express-jwt-error]', req.cookies.id_token);
    // `clearCookie`, otherwise user can't use web-app until cookie expires
    res.clearCookie('id_token');
  }
  next(err);
});

app.use(passport.initialize());

if (__DEV__) {
  app.enable('trust proxy');
}
app.get(
  '/login/facebook',
  passport.authenticate('facebook', {
    scope: ['email', 'user_location'],
    session: false,
  }),
);
app.get(
  '/login/facebook/return',
  passport.authenticate('facebook', {
    failureRedirect: '/login',
    session: false,
  }),
  (req, res) => {
    const expiresIn = 60 * 60 * 24 * 180; // 180 days
    const token = jwt.sign(req.user, config.auth.jwt.secret, { expiresIn });
    res.cookie('id_token', token, { maxAge: 1000 * expiresIn, httpOnly: true });
    res.redirect('/');
  },
);

//
// Register API middleware
// -----------------------------------------------------------------------------
app.use(
  '/graphql',
  expressGraphQL(req => ({
    schema,
    graphiql: __DEV__,
    rootValue: { request: req },
    pretty: __DEV__,
  })),
);

//
// Register server-side rendering middleware
// -----------------------------------------------------------------------------
app.get('*', async (req, res, next) => {
  try {
    const css = new Set();

    // Global (context) variables that can be easily accessed from any React component
    // https://facebook.github.io/react/docs/context.html
    const context = {
      // Enables critical path CSS rendering
      // https://github.com/kriasoft/isomorphic-style-loader
      insertCss: (...styles) => {
        // eslint-disable-next-line no-underscore-dangle
        styles.forEach(style => css.add(style._getCss()));
      },
      // Universal HTTP client
      fetch: createFetch(fetch, {
        baseUrl: config.api.serverUrl,
        cookie: req.headers.cookie,
      }),
    };

    const route = await router.resolve({
      ...context,
      pathname: req.path,
      query: req.query,
    });

    if (route.redirect) {
      res.redirect(route.status || 302, route.redirect);
      return;
    }

    const data = { ...route };
    data.children = ReactDOM.renderToString(
      <App context={context}>{route.component}</App>,
    );
    data.styles = [{ id: 'css', cssText: [...css].join('') }];
    data.scripts = [assets.vendor.js];
    if (route.chunks) {
      data.scripts.push(...route.chunks.map(chunk => assets[chunk].js));
    }
    data.scripts.push(assets.client.js);
    data.app = {
      apiUrl: config.api.clientUrl,
    };

    const html = ReactDOM.renderToStaticMarkup(<Html {...data} />);
    res.status(route.status || 200);
    res.send(`<!doctype html>${html}`);
  } catch (err) {
    next(err);
  }
});

//
// Error handling
// -----------------------------------------------------------------------------
const pe = new PrettyError();
pe.skipNodeFiles();
pe.skipPackage('express');

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(pe.render(err));
  const html = ReactDOM.renderToStaticMarkup(
    <Html
      title="Internal Server Error"
      description={err.message}
      styles={[{ id: 'css', cssText: errorPageStyle._getCss() }]} // eslint-disable-line no-underscore-dangle
    >
      {ReactDOM.renderToString(<ErrorPageWithoutStyle error={err} />)}
    </Html>,
  );
  res.status(err.status || 500);
  res.send(`<!doctype html>${html}`);
});

//
// Launch the server
// -----------------------------------------------------------------------------
const promise = models.sync().catch(err => console.error(err.stack));
if (!module.hot) {
  promise.then(() => {
    app.listen(config.port, () => {
      console.info(`The server is running at http://localhost:${config.port}/`);
    });
  });
}

//
// Hot Module Replacement
// -----------------------------------------------------------------------------
if (module.hot) {
  app.hot = module.hot;
  module.hot.accept('./router');
}

// SOCKET IO
// let serverIO;
// /* eslint-disable no-console */
// models.sync().catch(err => console.error(err.stack)).then(() => {
//   serverIO = app.listen(config.portTwo, () => {
//     console.log(`The server is running at http://localhost:${config.portTwo}/`);
//   });
// });
// /* eslint-enable no-console */
// const io = require('socket.io').listen(serverIO);

// io.connectedUsers = []

// io.on('connection', socket => {
//   socket.on('userConnect', user => {
//     var socketid = socket.id.slice(8)
//     socket.username = socketid // store some data about user on socket object
//     console.log('before user connect: '+connectedUsers)
//     connectedUsers.push(socket.username) // store connected user into server side
//     console.log('after user connect: '+connectedUsers)
//     io.emit('userConnect', {
//       name: user.name,
//       defaultName: socketid,
//       serverSideList: connectedUsers
//     })
//   })

//   socket.on('message', message => {
//     var from;
//     //message.from !== '' ? from = message.from : from = socket.id.slice(8)
//     if (message.from !=='' && message.from !== 'Me') {
//       from = message.from
//     } else {
//       from = socket.id.slice(8)
//     }
//     socket.broadcast.emit('message', {
//       body: message.body, // equivalent to "body: message.body"
//       from: from,
//       date: message.date
//     })
//   })

//   socket.on('changed name', name => {
//     socket.changedName = name
//     // check if socket.username 'default id' exists on server side list
//     // if it does, that means this user has not changed their name yet, so splice it out, and update with passed in name
//     var nameChangeFlag = connectedUsers.indexOf(socket.username)
//     if ( nameChangeFlag !== -1) {
//       connectedUsers.splice(connectedUsers.indexOf(socket.username),1,name)
//       console.log('user changed name: '+connectedUsers)
//     }

//     var nameInfo = {
//       name: name,
//       originalName: socket.username,
//       serverSideList: connectedUsers
//     }
//     io.emit('changed name', nameInfo)
//   })

//   socket.on('disconnect', () => {
//       // remove the disconnected user from server side list of users
//       if (socket.changedName) {
//         connectedUsers.splice(connectedUsers.indexOf(socket.changedName),1)
//         console.log('user with changed name disconnected: '+socket.changedName)
//       } else {
//         connectedUsers.splice(connectedUsers.indexOf(socket.username),1)
//         console.log('user with un-changed name disconnected: '+socket.id.slice(8))
//       }

//      io.emit('user disconnected', {
//        id: socket.changedName ? socket.changedName : socket.username,
//        serverSideList: connectedUsers
//      });
//    });

// })

// SOCKET IO

export default app;
