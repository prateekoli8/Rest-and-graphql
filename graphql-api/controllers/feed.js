const fs = require('fs');
const path = require('path');

const io = require('../socket');

const { validationResult } = require('express-validator/check');

const User = require('../models/user');
const Post = require('../models/post');

exports.getStatus = (req, res, next) => {
  User.findById(req.userId)
  .then(user => {
    if(!user) {
      const err = new Error('Error while returning the status');
      err.statusCode = 404;
      throw err;
    }
    const userStatus = user.status;
    res.status(200).json({message: 'User Status Found', status: userStatus});
  })
  .catch(err => {
    if(!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  })
};

exports.updateStatus = (req, res , next) => {
  const newStatus = req.body.status;
  console.log(newStatus);
  User.findById(req.userId)
    .then(user => {
      if (!user) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
      }
      user.status = newStatus;
      return user.save();
    })
    .then(result => {
      res.status(200).json({ message: 'User updated.' });
    })
    .catch(err => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.getPosts = async (req, res, next) => {
  const currentPage = req.query.page || 1;
  const perPage = 2;
  try {
    let totalItems = await Post.find().countDocuments();
  const posts = await Post.find().populate('creator')
  .sort({ createdAt: -1 })
    .skip((currentPage - 1 ) * perPage)
    .limit(perPage);
    res
    .status(200)
    .json({ message: 'Fetched posts successfully.', posts: posts , totalItems: totalItems });
  } catch(err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  };
};

exports.createPost = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect.');
    error.statusCode = 422;
    throw error;
  }
  if (!req.file) {
    const error = new Error('No image provided.');
    error.statusCode = 422;
    throw error;
  }
  const imageUrl = req.file.path.replace("\\","/");
  const title = req.body.title;
  const content = req.body.content;
  const post = new Post({
    title: title,
    content: content,
    imageUrl: imageUrl,
    creator: req.userId
  });
  let creator;
  post
    .save()
    .then(result => {
      return User.findById(req.userId);
    })
    .then(user => {
      creator = user;
      user.posts.push(post);
      return user.save();
    })
    .then(result => {
      io.getIO().emit('posts', {action: 'create', post: { ...post._doc , creator: {_id : req.userId , name: creator.name} } });
      res.status(201).json({
        message: 'Post created successfully!',
        post: post,
        creator: {_id: creator._id, name: creator.name
        }
      });
    })
    .catch(err => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.getPost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
    .then(post => {
      if (!post) {
        const error = new Error('Could not find post.');
        error.statusCode = 404;
        throw error;
      }
      res.status(200).json({ message: 'Post fetched.', post: post });
    })
    .catch(err => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};


exports.updatePost = async (req, res, next) => {
  const postId = req.params.postId;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect.');
    error.statusCode = 422;
    throw error;
  }
  const title = req.body.title;
  const content = req.body.content;
  let imageUrl = req.body.image;
  if (req.file) {
    imageUrl = req.file.path;
  }
  if (!imageUrl) {
    const error = new Error('No file picked.');
    error.statusCode = 422;
    throw error;
  }
  try {
    const post = await Post.findById(postId).populate('creator');
    if (!post) {
      const error = new Error('Could not find post.');
      error.statusCode = 404;
      throw error;
    }
    if (post.creator._id.toString() !== req.userId) {
      const error = new Error('Not authorized!');
      error.statusCode = 403;
      throw error;
    }
    if (imageUrl !== post.imageUrl) {
      clearImage(post.imageUrl);
    }
    post.title = title;
    post.imageUrl = imageUrl;
    post.content = content;
    const result = await post.save();
    io.getIO().emit('posts', { action: 'update', post: result });
    res.status(200).json({ message: 'Post updated!', post: result });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.deletePost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
  .then(post => {
    if(!post) {
      const err = new Error('Could not find the reqeusted post');
      err.statusCode = 404;
      throw err;
    }
    if(post.creator.toString() !== req.userId) {
      const err = new Error('Unauthorized Access');
      err.statusCode = 403;
      throw err;
    }
    clearImage(post.imageUrl);
    return Post.findByIdAndDelete(postId);
  })
  .then(result => {
    return User.findById(req.userId);
  })
  .then(user => {
    user.posts.pull(postId);
    return user.save();
  })
  .then(result => {
    io.getIO().emit('posts', { action: 'delete' , post: postId});
    res.status(200).json({message: 'Post Deleted Successfully'});
  })
  .catch(err => {
    if(!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  })
}

const clearImage = filePath => {
  filePath = path.join(__dirname, '..' , filePath);
  fs.unlink(filePath, err => console.log(err));
}