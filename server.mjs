import dotenv from "dotenv";
dotenv.config({ path: "./config.env" });
import express from "express";
import cors from "cors";
import User from "./Models/userModel.js";
import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { URL } from 'url';
import {Server} from 'socket.io'



// Database operations
import mongoose from 'mongoose'
const app = express();
app.use(express.json());       
app.use(cors());

mongoose.connect(`${process.env.CON_STR}`)
.then((con) => { 
    console.log("Connected to MongoDB")
    const PORT = 8000;
    app.listen(PORT, () => {
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

const io = new Server("https://any-chat-server.onrender.com", {
    cors: { 
        origin: ["http://localhost:8080", "https://any-chat-server.vercel.app", "https://any-chat-client.onrender.com"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

const connectedUsers = new Map()

io.on("connection", socket => {    

    socket.on('user-connected', async (nickname) => {
        const user = await User.find({name: nickname})
        let userObj;
        if (user.length === 0) {        
            userObj = {
                socketId: socket.id,
                name: nickname,
            }        
            createUser(userObj)
        } else {
            const updateUserId = await User.updateMany({name: nickname}, {$set: {socketId: socket.id}})
        }
        connectedUsers.set(socket.id, nickname);
        const users = Array.from(connectedUsers.values());
        const distinctUsers = new Set(users);
        io.emit("user-connected", Array.from(distinctUsers))
    });

    socket.on("send-message", (message, nickname, time) => { // listen for message received from client with same custom event name using socket.emit
        const userObj = {
            name: nickname,
            time: time,
            message: message,
            receiver: "all"
        }        
        createUser(userObj)
        socket.broadcast.emit("receive-message", message, nickname, time);
    });  // end of socket.on send-message

    socket.on("disconnect", async () => {        
        const userLeft = connectedUsers.get(socket.id);
        socket.broadcast.emit("user-disconnect", userLeft);
        connectedUsers.delete(socket.id);
    }) // end of socket.on disconnect

    
    socket.on("send-message-to-user", async (message, sender, time, receiver) => {
        let receiverId = await User.findOne({name: receiver}, {socketId: 1, _id: 0})     
        const userObj = {
            name: sender,
            time: time,
            message: message,
            receiver: receiver,
        }   
        const senderObj = {
            name: sender,
            time: time,
            message: message,
            sender: sender,
            r: receiver
        }
        createUser(userObj)
        createUser(senderObj)
        
        socket.to(receiverId.socketId).emit("send-message-to-user", message, sender, `${new Date().toLocaleString()}`);        
    })   

    socket.on("delete-message", async (index, id, active, nickname, message, time) => {
        if(active === "allMessages") {
            console.log("Message to be deleted has id", id)
            const deleteMessage = await User.deleteOne({message: message, time: time, receiver: "all"});
            console.log("Deleted message for all is ", deleteMessage)
            socket.broadcast.emit("delete-message", index, "allMessages", message, time)
        } else {
            const receiver = await User.find({ message: message, time: time })
            const extractedReceiver = receiver[0].receiver || receiver[0].r || receiver[1].receiver || receiver[1].r || receiver.receiver || receiver.r
            console.log(`Receiver is ${receiver} and extracted receiver is ${extractedReceiver}`)
            const receiverId = await User.findOne({name: extractedReceiver}, {socketId: 1, _id: 0})
            console.log(`Receiver id is ${receiverId.socketId}`)
            socket.to(receiverId.socketId).emit("delete-message", index, "myMessages", message, time)
            const deletedMessage = await User.deleteMany({ $and: [{ message: message, time: time }, { receiver: { $ne: "all" } }]});
            console.log("Deleted message for everyone is ", deletedMessage)
        }
        // socket.broadcast.emit("delete-message", index)
    })

    socket.on("delete-message-for-me", async (message, time, active, name) => {
        if(active === "myMessages") {
            const deleteMessage = await User.deleteOne({message: message, time: time, $or: [{receiver: name}, {sender: name}]});
            console.log("Deleted message for me is ", deleteMessage)
        }
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

app.get("/users/:name", async (req, res) => {
    const name = req.params.name;
    try {
        const users = await User.find( {$or: [{receiver: name}, {sender: name}]} );
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