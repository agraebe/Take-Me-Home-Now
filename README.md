# Take-Me-Home-Now
UberX sample app that allows to control the sandbox mode.

## Early release!
Please be aware that this is a very early release. No tests yet (and probably some bugs), no detailed exception handling and limited scope of functionality (e.g. only UberX requests).

# Key Features
- [x] Get browser-based location
- [x] Usage of the Uber API thanks to [node-uber](https://github.com/shernshiou/node-uber)
- [x] Request Uber ride to Home place - *must be maintained in your Uber profile*
- [x] Responsive UI thanks to [Bootstrap 3](http://getbootstrap.com/)

# Installation
As usual, run this first:
```
npm install
```

Then, start the server from the root dir with the following command:
```
client_id=[1] client_secret=[2] server_token=[3] redirect_uri=[4] mashape_key=[5] nodemon app.js
```

*Keep in mind that you HAVE to replace [x] with your own credentials!*

After that, you can access the web app by opening ``http://localhost:1455/``.
