import {v2 as cloudinary} from 'cloudinary'
import fs from 'fs'
import dotenv from "dotenv";
dotenv.config({ path: "./config.env" });


cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadCloudinary = async (localFilePath) => {
    try {
        if(!localFilePath) {
            return null
        }
        const result = await cloudinary.uploader.upload(localFilePath, 
            {resource_type: "auto"}
        );
        // console.log("File uploaded to Cloudinary: ", result.secure_url, result.url)
        return result.secure_url;
    } catch (error) {
        fs.unlinkSync(localFilePath)
        console.error("Error uploading file to Cloudinary: ", error)
        return null
    }
} // end of uploadCloudinary


export {uploadCloudinary}