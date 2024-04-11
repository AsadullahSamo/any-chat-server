const fs = require("fs");
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({        // In this schema, we can define the properties we want to have for our model
    socketId: {
        type: String,
    },
    name: {
        type: String,
    },
    message: {
        type: String,
        minLength: [1], 
        maxLength: [1000],
    },
    time: {
        type: String,
    },
    receiver: {
        type: String,
    },
    sender: {
        type: String,
    },
    r: {
        type: String,
    },
})

const Users = mongoose.model("users", userSchema); 
module.exports = Users;