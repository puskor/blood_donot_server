const express = require('express');
require('dotenv').config()
const port = process.env.PORT || 5001;
var cors = require('cors')
const app = express();

// Middleware
app.use(cors())
app.use(express.json()); // CRITICAL: ক্লায়েন্ট সাইডের বডি ডাটা রিড করার জন্য এটি লাগবে

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.PRIVATE_DB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();

        // Database এবং Collection ডিফাইন করা
        const database = client.db("blood_donor");
        const usersCollection = database.collection("users_profile");

        // ১. রুট রাউট
        app.get("/", (req, res) => {
            res.send("hello this is donor");
        });

        // ২. কাস্টম সাইন-আপ মেটাডাটা সেভ করার POST API রাউট
        app.post("/api/user/save-details", async (req, res) => {
            try {
                const profileData = req.body;
                // ডাটাবেজে ডাটা ইনসার্ট করা
                const result = await usersCollection.insertOne(profileData);

                res.status(201).send({
                    success: true,
                    message: "User additional metadata stored successfully",
                    insertedId: result.insertedId
                });
            } catch (error) {
                console.error("DB Insertion Error:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.get("/api/user/save-details", async (req, res) => {
            const { userId } = req.query;
            // console.log("id",userId)
            const result = await usersCollection.findOne({ userId });
            res.json(result);
        });

        console.log("Successfully connected to MongoDB!");
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});