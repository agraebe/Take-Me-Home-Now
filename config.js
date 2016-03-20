var config = {
  uber: {},
  mashape: {},
  express: {}
};

config.uber.client_id = process.env.client_id;
config.uber.client_secret = process.env.client_secret;
config.uber.server_token = process.env.server_token;
config.uber.redirect_uri = process.env.redirect_uri;
config.uber.sandbox = process.env.sandbox || true;
config.uber.scopes = process.env.scopes || ['history', 'profile', 'places', 'request'];

config.mashape.key = process.env.mashape_key;

config.express.port = 1455;
config.express.app_name = 'Take Me Home Now!';

module.exports = config;
