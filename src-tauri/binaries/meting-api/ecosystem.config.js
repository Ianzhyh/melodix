module.exports = {
    apps: [{
        name: 'meting-api',
        script: './server.js',
        env: {
            PORT: 3300,
            METING_COOKIES: process.env.METING_COOKIES || ''
        }
    }]
};