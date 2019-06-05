const User = require('../models/user');
const { validationResult } = require('express-validator/check');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.signup = (req, res , next) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const err = new Error('Validation failed while signing up the user');
        err.statusCode = 422;
        err.data = errors.array();
        throw err;
    }
    const email = req.body.email;
    const password = req.body.password;
    const name = req.body.name;

    bcrypt
    .hash(password, 12)
    .then(hashedPassword => {
        const user = new User({
            email: email,
            password: hashedPassword,
            name: name
        });
        return user.save();
    })
    .then(result => {
        res.status(201).json({message: 'User created successfully', userId: result._id});
    })
    .catch(err => {
        if(!err.statusCode){
            err.statusCode = 500;
        }
        next(err);
    });
};

exports.login = (req, res, next) => {
    const email = req.body.email;
    const password = req.body.password;
    let currentUser;

    User.findOne({email: email})
    .then(user => {
        if(!user) {
            const err = new Error('No registered user for this email found');
            err.statusCode = 401;
            throw err;
        }
        currentUser = user;
        return bcrypt.compare(password, currentUser.password);
    })
    .then(isEqual => {
        if(!isEqual) {
            const err = new Error('Wrong Password');
            err.statusCode = 401;
            throw err;
        }
        const token = jwt.sign(
            {email: email, userId: currentUser._id.toString()},
            'secret',
            {expiresIn: '1h'}
            );
            res.status(200).json({token: token, userId: currentUser._id.toString()});
    })
    .catch(err => {
        if(!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    })

};