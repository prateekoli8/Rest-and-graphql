const User = require('../models/user');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const Post = require('../models/post');
const { clearImage } = require('../util/file');

module.exports = {
    createUser: async function({ userInput }, req) {
        const email = userInput.email;
        const errors = [];
    if (!validator.isEmail(userInput.email)) {
      errors.push({ message: 'E-Mail is invalid.' });
    }
    if (
      validator.isEmpty(userInput.password) ||
      !validator.isLength(userInput.password, { min: 5 })
    ) {
      errors.push({ message: 'Password too short!' });
    }
    if (errors.length > 0) {
      const error = new Error('Invalid input.');
      error.data = errors;
      error.code = 422;
      throw error;
    }
        const existingUser = await User.findOne({ email: userInput.email });
        if(existingUser) {
            const error = new Error('User already exists!');
            throw error;
        }
        const hashedPw = await bcrypt.hash(userInput.password, 12);
        const user = new User ({
            email: userInput.email,
            name: userInput.name,
            password: hashedPw
        });
        const createdUser = await user.save();
        return {...createdUser._doc, _id: createdUser._id.toString()};
    },

    login: async function( {email, password}){
      const user = await User.findOne({email: email});
      if(!user) {
        const error = new Error('User Not Found');
        error.Code = 401;
        throw error;
      }
      const isEqual = await bcrypt.compare(password, user.password);
      if(!isEqual) {
        const error = new Error('Password is incorrect');
        error.code = 401;
        throw error;
      }
      const token = jwt.sign({
        email: user.email,
        userId: user._id.toString()
      }, 'secret', { expiresIn: '1h' });
      return {token: token, userId: user._id.toString()};
    },

    createPost: async function({ postInput }, req) {
      if(!req.isAuth) {
        const err = new Error('Not authorized to create a post');
        err.code = 401;
        throw err;
      }
      const errors = [];
      if(validator.isEmpty(postInput.title) || !validator.isLength(postInput.title, {min: 5})) {
        errors.push({message: 'Title is invalid'});
      }
      if(validator.isEmpty(postInput.content) || !validator.isLength(postInput.content, {min: 5}) ){
        errors.push({message: 'Content is Invalid'})
      }
      if (errors.length > 0) {
        const error = new Error('Invalid input.');
        error.data = errors;
        error.code = 422;
        throw error;
      }
      console.log(postInput.imageUrl);
      const updatedImageUrl = postInput.imageUrl.replace("\\","/");
      console.log('updated:' + updatedImageUrl);
      const user = await User.findById(req.userId);
      const post = new Post({
        title: postInput.title,
        content: postInput.content,
        imageUrl: updatedImageUrl,
        creator: user
      });
      const createdPost = await post.save();
      user.posts.push(createdPost);
      await user.save();
      return { ...createdPost._doc, _id: createdPost._id.toString(), createdAt: createdPost.createdAt.toISOString(), updatedAt: createdPost.updatedAt.toISOString() };
    },

    posts: async function({page}, req) {
      if(!req.isAuth) {
        const err = new Error('Not authorized fetch posts');
        err.code = 401;
        throw err;
      }
      if(!page) {
        page = 1;
      }
      perPage = 3;
      const totalPosts = await Post.find().countDocuments();
      const posts = await Post.find().sort({createdAt: -1}).skip((page - 1) * perPage)
      .limit(perPage).populate('creator');
      return { posts: posts.map(p => {
        return {
          ...p._doc,
          _id: p._id.toString(),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString()
        }
      }) ,totalPosts: totalPosts };
    },

    post: async function({ postId }, req){
      if (!req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }
      const post = await Post.findById(postId).populate('creator');
      if(!post) {
        const error = new Error('Post not Found');
        error.code = 404;
        throw error;
      }
      return { ...post._doc, _id: post._id.toString(), createdAt: post.createdAt.toISOString(), updatedAt: post.updatedAt.toISOString() };
    },

    updatePost: async function({ postId, postInput }, req){
      if (!req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      } 
      const post = await Post.findById(postId).populate('creator');
      if(!post) {
        const error = new Error('Post not Found');
        error.code = 404;
        throw error;
      }
      if( post.creator._id.toString() !== req.userId.toString() ){
        const error = new Error('Not Authorized to Edit');
        error.code = 401;
        throw error;
      }
      const errors = [];
      if(validator.isEmpty(postInput.title) || !validator.isLength(postInput.title, {min: 5})) {
        errors.push({message: 'Title is invalid'});
      }
      if(validator.isEmpty(postInput.content) || !validator.isLength(postInput.content, {min: 5}) ){
        errors.push({message: 'Content is Invalid'})
      }
      if (errors.length > 0) {
        const error = new Error('Invalid input.');
        error.data = errors;
        error.code = 422;
        throw error;
      }

      post.title = postInput.title;
      post.content = postInput.content;
      if(postInput.imageUrl !== 'undefined') {
        post.imageUrl = postInput.imageUrl;
      }
      const updatePost = await post.save();
      return { ...updatePost._doc, _id: updatePost._id.toString(), createdAt: updatePost.createdAt.toISOString(), updatedAt: updatePost.updatedAt.toISOString() };
    },

    deletePost: async function({ postId }, req){
      console.log('here');
      if (!req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }
      const post = await Post.findById(postId).populate('creator');
      if(!post) {
        const error = new Error('Post not Found');
        error.code = 404;
        throw error;
      }
      if( post.creator._id.toString() !== req.userId.toString() ){
        const error = new Error('Not Authorized to Edit');
        error.code = 401;
        throw error;
      }
      clearImage(post.imageUrl);
      await Post.findByIdAndRemove(postId);
      const user = await User.findById(req.userId);
      user.posts.pull(postId);
      await user.save();
      return true;
    },
    user: async function(args, req) {
      if (!req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }
      const user = await User.findById(req.userId);
      if (!user) {
        const error = new Error('No user found!');
        error.code = 404;
        throw error;
      }
      return { ...user._doc, _id: user._id.toString() };
    },
    updateStatus: async function({ status }, req) {
      if (!req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }
      const user = await User.findById(req.userId);
      if (!user) {
        const error = new Error('No user found!');
        error.code = 404;
        throw error;
      }
      user.status = status;
      await user.save();
      return { ...user._doc, _id: user._id.toString() };
    }
}