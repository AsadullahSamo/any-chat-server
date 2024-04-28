import multer from "multer";
import fs from "fs";
import { uploadCloudinary } from "../services/cloudinary.mjs";

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads");
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
        console.log(`File ${file.originalname} uploaded at path ${file.path}`)
    }
});

export const upload = multer({ storage: storage })