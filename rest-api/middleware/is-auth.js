const jwt = require('jsonwebtoken');

module.exports = (req, res , next) => {
    const token = req.get('Authorization').split(' ')[1];
    let decodedToken;
    try{
        decodedToken = jwt.verify(token, 'secret');
    } catch(err) {
        err.statusCode = 500;
        throw err;
    }
    if(!decodedToken) {
        const err = new Error('Unauthorized access');
        err.statusCode = 401;
        throw err;
    }
    req.userId = decodedToken.userId;
    next();
}