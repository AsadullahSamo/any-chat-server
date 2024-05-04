import dotenv from "dotenv";
dotenv.config({ path: "./config.env" });
import express from "express";
import cors from "cors";
import User from "./Models/userModel.js";
import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { URL } from 'url';
import {Server} from 'socket.io'
import { createServer } from "http";
import { uploadCloudinary } from "./services/cloudinary.mjs";
import path from 'path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {upload} from './middlewares/multer.mjs'

// Database operations
const app = express();
app.use(express.json());       
app.use(cors());
const httpServer = createServer(app);
import mongoose from 'mongoose'

mongoose.connect(`${process.env.CON_STR}`)
.then((con) => { 
    console.log("Connected to MongoDB")
    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}).catch(err => console.log("Error connecting to MongoDB", err.message));

const createUser = async (userObj) => {
    try {
        const user = await User.create(userObj);
    } catch (err) {
        console.log(err.message);
    }
}

const io = new Server(httpServer, {
    cors: { 
        origin: ["http://localhost:3000", "https://any-chat-client.onrender.com", "https://any-chat-client.vercel.app"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

const connectedUsers = new Map()

io.on("connection", socket => {    

    socket.on('user-connected', async (nickname, email, userID) => {
        // console.log("User connected", nickname, userID)
        const user = await User.find({email: email})
        let userObj;
        if (user.length === 0) {        
            userObj = {
                email: email,
                socketId: socket.id,
                userID: userID,
                myContacts: []
            }        
            createUser(userObj)
        } else {
            const updateUserId = await User.updateMany({email: email}, {$set: {socketId: socket.id}})
        }
        connectedUsers.set(socket.id, nickname);
        const users = Array.from(connectedUsers.values());
        const distinctUsers = new Set(users);
        io.emit("user-connected", Array.from(distinctUsers))
    });

    socket.on('contact-added', async (name, userID, myUserID) => {
        let user = await User.updateMany({userID: myUserID}, {$push: {myContacts: {name: name, userID: userID}}})
        console.log(`Contact added to ${myUserID}`, user)
    });

    socket.on("send-message", (isFile, size, file, message, nickname, time, userID) => { // listen for message received from client with same custom event name using socket.emit
        
        let userObj = {
            name: nickname,
            time: time,
            message: message,
            receiver: "all",
            isFile: isFile,
            userID: userID
        };
    
        if (isFile) {
            userObj.size = size;
            userObj.file = file;
            userObj.fileUrl = '';
            userObj.message = file
        }
        createUser(userObj)
        socket.broadcast.emit("receive-message", isFile, message, nickname, time, size, userID);
    });  // end of socket.on send-message

    socket.on("disconnect", async () => {        
        const userLeft = connectedUsers.get(socket.id);
        socket.broadcast.emit("user-disconnect", userLeft);
        connectedUsers.delete(socket.id);
    }) // end of socket.on disconnect

    
    socket.on("send-message-to-user", async (isFile, size, file, message, sender, time, receiverUserID, senderUserID) => {
        // let myPhone = phone.replace("+", "")
        // let sPhone = senderPhone.replace("+", "")
        console.log(`Sender's id is ${senderUserID} and receiver's id is ${receiverUserID}`)
        let userObj = {
            name: sender,
            time: time,
            message: message,
            receiver: receiverUserID,
            sender: senderUserID,
            isFile: isFile,
            userID: senderUserID
        }   
        if(isFile) {
            userObj.size = size;
            userObj.file = file;
            userObj.fileUrl = 'empty';
            userObj.message = file
        }
        createUser(userObj)
        
        let receiverId = await User.findOne({userID: receiverUserID}, {socketId: 1, _id: 0})     
        console.log(`Receiver's socket id is ${receiverId.socketId}`)
        socket.to(receiverId.socketId).emit("send-message-to-user", isFile, message, sender, `${new Date().toLocaleString()}`, size, senderUserID);        
    })   

    socket.on("delete-message", async (index, id, active, nickname, message, time) => {
        if(active === "allMessages") {
            const deleteMessage = await User.deleteOne({message: message, time: time, receiver: "all"});
            socket.broadcast.emit("delete-message", index, "allMessages", message, time)
        } else {
            const receiver = await User.find({ message: message, time: time }, {receiver: 1, _id: 0})
            const receiverId = await User.findOne({userID: receiver[0].receiver}, {socketId: 1, _id: 0})
            console.log(`Receiver's socket id is ${receiverId.socketId}`)
            socket.to(receiverId.socketId).emit("delete-message", index, "myMessages", message, time)
            const deletedMessage = await User.deleteMany({ $and: [{ message: message, time: time }, { receiver: { $ne: "all" } }]});
            console.log(deletedMessage)
        }
    })

    socket.on("edit-message", async (index, oldData, newData, time, active) => {
        if(active === "allMessages") {
            const updateMessage = await User.updateOne({message: oldData, time: time, receiver: "all"}, {message: newData});
            socket.broadcast.emit("edit-message", index, newData, active)
        } else {
            const receiver = await User.find({ message: oldData, time: time }, {receiver: 1, _id: 0})
            const receiverId = await User.findOne({userID: receiver[0].receiver}, {socketId: 1, _id: 0})
            console.log(`Receiver's id is ${receiverId.socketId}`)
            socket.to(receiverId.socketId).emit("edit-message", index, newData, active)
            const updateMessage = await User.updateMany({ $and: [{ message: oldData, time: time }, { receiver: { $ne: "all" } }]}, {message: newData});
            
        }
    })

    socket.on('user-details', async (myUserID, name, userID, myDeletedMessages) => {
        let sPhone = myUserID
        let rPhone = userID
        const user = await User.find({$or: [{receiver: rPhone, sender: sPhone}, {receiver: sPhone, sender: rPhone}]} )
        // console.log(`Messages between ${sPhone} and ${rPhone} are`, user)
        const filteredData = user.filter(message => !myDeletedMessages.some(deletedMessage =>  Array.isArray(deletedMessage) && deletedMessage.length >= 2 && deletedMessage[0] === message.message && deletedMessage[1] === message.time));
        socket.emit('user-details', filteredData)
    })

})

// API routes
app.get("/users/all", async (req, res) => {
    try {
        const users = await User.find({receiver: "all"});
        res.json(users);
    } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/users/:userID", async (req, res) => {
    let userID = req.params.userID;
    // phone = phone.replace("+", "")
    try {
        const users = await User.find( {$or: [{receiver: userID}, {sender: userID}]} );
        res.json(users);
    } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});


app.get("/users", async (req, res) => {
    try {
        const users = Array.from(connectedUsers.values());
        const distinctUsers = new Set(users);
        res.json(Array.from(distinctUsers));
    } catch(e) {
        console.error("Error fetching online users:", err);
        res.status(500).json({ error: "Internal server error" });
    }
})

// scrape the metadata of a website

app.get("/scrape", async (req, res) => {

    const url = req.query.url;
		const urlObj = new URL(url);
    try {
        const response = await fetch(url);
        if (!response.ok) {
                throw new Error('Network response was not ok');
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract the metadata
        let title = $('title').text().trim() || null;
        title = title && title.length > 100 ? title.substring(0, 100) + '...' : title; // Limit title length
        let description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || null;
        let image = $('meta[property="og:image"]').attr('content') || $('img').first().attr('src') || null;
        let favicon = `${urlObj.origin}/favicon.ico` || $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || $('meta[property="og:image"]').attr('content') || $('img').first().attr('src')
        const siteName = $('meta[property="og:site_name"]').attr('content') || $('meta[property="og:site"]').attr('content') || $('meta[name="application-name"]').attr('content') || `${urlObj.origin}` || null;

        if (!favicon) {
            const firstImageSrc = $('img').first().attr('src');
            if (firstImageSrc) {
                favicon = firstImageSrc;
            }
        }
        // Return the metadata
        res.json({ url, title, description, image, favicon, siteName});

    } catch (err) {
        console.error('An error occurred:', err);
        res.status(500).json({ error: "Internal server error" });
    }
})

// FILE UPLOAD
let fileUrl;
app.post('/upload', upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const url = await uploadCloudinary(req.file.path)
    fileUrl = url;

    res.status(200).json({ message: "File uploaded successfully" });
    const file = await User.updateMany({message: req.file.originalname}, {fileUrl: url})
    console.log(`Database updated with fileUrl ${url}`, file)
});

app.get('/file', (req, res) => {
    res.status(200).json({fileUrl})
})

app.use('/uploads', express.static('/uploads'));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.get('/uploads/:fileName', async (req, res) => {
    const file = req.params.fileName;
    const filePath = path.join(__dirname, 'uploads', file);
    console.log("File name is ", file)
    console.log("File path is ", filePath)
    res.download(filePath)
})

app.get('/email', async (req, res) => {
    const email = req.query.email;
    const user = await User.find({email: email})
    res.json(user)
})

app.get('/myContacts/:userID', async (req, res) => {
    const userID = req.params.userID;
    const user = await User.find({userID: userID}, {myContacts: 1, _id: 0})
    res.json(user)
})
