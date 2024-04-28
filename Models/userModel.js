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
    isFile: {
        type: Boolean,
    },
    size: {
        type: Number,
    },
    file: {
        type: String,
    },
    phone: {
        type: Number,
    },
    fileUrl: {
        type: String,
    }
})

const Users = mongoose.model("users", userSchema); 
module.exports = Users;