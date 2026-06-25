const express = require('express');
require('dotenv').config()
const port = process.env.PORT || 5001;
var cors = require('cors')
const app = express();

// Middleware
app.use(cors())
app.use(express.json()); // CRITICAL: ক্লায়েন্ট সাইডের বডি ডাটা রিড করার জন্য এটি লাগবে

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
        app.get("/api/user/save-details/:id", async (req, res) => {
            const { id } = req.params;
            // console.log("id",id)

            const result = await usersCollection.findOne({ userId: id });
            res.json(result);
        });

        app.get("/api/user/save-details", async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.json(result);
        });




        // request collection instance
        const request = database.collection("request");
        app.post("/api/request", async (req, res) => {
            try {
                const bloodRequestData = req.body;
                const finalRequestData = {
                    ...bloodRequestData,
                    createdAt: new Date()
                };
                const result = await request.insertOne(finalRequestData);

                res.status(201).send({
                    success: true,
                    message: "Blood donation request stored successfully",
                    insertedId: result.insertedId,
                    data: finalRequestData
                });
            } catch (error) {
                console.error("DB Insertion Error:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.get("/api/request-by-id", async (req, res) => {
            try {
                const { userId } = req.query;
                if (!userId) {
                    return res.status(400).json({ success: false, message: "User ID is required" });
                }
                const result = await request.find({ userId: userId }).sort({ createdAt: -1 }).toArray();
                res.json(result);
            } catch (error) {
                console.error("Fetch User Requests Error:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.get("/api/request", async (req, res) => {
            try {
                // ১. ফ্রন্টএন্ড থেকে পাঠানো কোয়েরি প্যারামিটারগুলো ধরা হচ্ছে
                const { bloodGroup, division, district, upazila } = req.query;

                // পেজিনেশন প্যারামিটার (ডিফল্ট পেজ = ১, লিমিট = ৯ যেহেতু ফ্রন্টএন্ডে ৩ কলাম গ্রিড)
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 9;
                const skip = (page - 1) * limit;

                // ২. ডাইনামিক ফিল্টার অবজেক্ট তৈরি
                let queryObj = {};

                if (bloodGroup) queryObj.bloodGroup = bloodGroup;
                if (division) queryObj.division = division;
                if (district) queryObj.district = district;
                if (upazila) queryObj.upazila = upazila;

                // ৩. ফিল্টার অনুযায়ী ডাটাবেজের মোট রিকোয়েস্ট সংখ্যা বের করা (পেজিনেশন ক্যালকুলেশনের জন্য)
                const totalRequests = await request.countDocuments(queryObj);

                // ৪. skip, limit এবং sort ব্যবহার করে নির্দিষ্ট পেজের ডাটা আনা
                const result = await request.find(queryObj)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                // মোট কয়টি পেজ তৈরি হবে তার হিসাব
                const totalPages = Math.ceil(totalRequests / limit);

                // ৫. ফ্রন্টএন্ড অ্যাকশনের স্ট্রাকচার অনুযায়ী রেসপন্স পাঠানো
                res.status(200).json({
                    success: true,
                    data: result,
                    pagination: {
                        totalRequests,
                        totalPages,
                        currentPage: page,
                        limit
                    }
                });

            } catch (error) {
                console.error("Fetch Filtered Requests Error:", error);
                res.status(500).json({ success: false, message: "Internal Server Error" });
            }
        });



        app.get("/api/request/:id", async (req, res) => {
            try {
                const { id } = req.params;
                // console.log(id)

                const result = await request.findOne({
                    _id: new ObjectId(id)
                });

                if (!result) {
                    return res.status(404).json({
                        success: false,
                        message: "Request not found"
                    });
                }
                res.json(result);
            } catch (error) {
                console.error("Fetch Request Error:", error);
                res.status(500).json({
                    success: false,
                    message: "Internal Server Error"
                });
            }
        });

        // 📝 ১. Blood Request Update API (PATCH)
        // এই রাউটটি দিয়ে স্ট্যাটাস চেঞ্জ (Accept/In Progress) এবং এডিট মডালের ডাটা উভয়ই আপডেট করা যাবে
        app.patch("/api/request/update/:id", async (req, res) => {
            try {
                const { id } = req.params;
                // ফ্রন্টএন্ড থেকে আসা সম্ভাব্য সব আপডেট ফিল্ড রিসিভ করা হচ্ছে
                const { donorId, status, patientName, bloodGroup, hospitalName, neededDate, neededTime } = req.body;

                // মঙ্গোডিবির অবজেক্ট আইডি ভ্যালিডেশন সেফটি চেক
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid Request ID format"
                    });
                }

                // ডাইনামিক আপডেটের জন্য অবজেক্ট তৈরি
                const updateData = {
                    updatedAt: new Date()
                };

                // যদি ভলান্টিয়ার বা ডোনার রিকোয়েস্ট অ্যাকসেপ্ট করে (Status/DonorId আপডেট)
                if (status) updateData.status = status;
                if (donorId) updateData.acceptedBy = donorId;

                // যদি ইউজার এডিট মডাল থেকে ডাটা চেঞ্জ করে
                if (patientName) updateData.patientName = patientName;
                if (bloodGroup) updateData.bloodGroup = bloodGroup;
                if (hospitalName) updateData.hospitalName = hospitalName;
                if (neededDate) updateData.neededDate = neededDate;
                if (neededTime) updateData.neededTime = neededTime;

                // ডাটাবেজে আপডেট অপারেশন রান করা
                const result = await request.findOneAndUpdate(
                    { _id: new ObjectId(id) },
                    { $set: updateData },
                    { returnDocument: "after" } // আপডেটেড নতুন ডাটা রিটার্ন করবে (Mongoose হলে { new: true } ব্যবহার করবেন)
                );

                if (!result) {
                    return res.status(404).json({
                        success: false,
                        message: "Blood request not found"
                    });
                }

                res.json({
                    success: true,
                    message: "Request updated successfully",
                    data: result
                });

            } catch (error) {
                console.error("Update Request Error:", error);
                res.status(500).json({
                    success: false,
                    message: "Internal Server Error"
                });
            }
        });


        // 🚨 ২. Blood Request Delete API (DELETE)
        // টেবিল থেকে ডিলিট বাটনে চাপ দিলে এবং মডালে কনফার্ম করলে এই এপিআই কাজ করবে
        app.delete("/api/request/delete/:id", async (req, res) => {
            try {
                const { id } = req.params;

                // আইডি ভ্যালিডেশন চেক
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid Request ID format"
                    });
                }

                // ডাটাবেজ থেকে রিমুভ করার কমান্ড (Mongoose হলে request.findByIdAndDelete(id))
                const result = await request.deleteOne({ _id: new ObjectId(id) });

                // যদি কোনো ডকুমেন্ট ডিলিট না হয় (ভুল আইডি বা অলরেডি ডিলিটেড)
                if (result.deletedCount === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Request not found or already deleted"
                    });
                }

                res.json({
                    success: true,
                    message: "Blood request deleted successfully"
                });

            } catch (error) {
                console.error("Delete Request Error:", error);
                res.status(500).json({
                    success: false,
                    message: "Internal Server Error"
                });
            }
        });


        const donate = database.collection("donate");
        app.post("/api/donate", async (req, res) => {
            try {
                const bloodRequestData = req.body;
                const finalRequestData = {
                    ...bloodRequestData,
                    createdAt: new Date()
                };
                const result = await donate.insertOne(finalRequestData);

                res.status(201).send({
                    success: true,
                    message: "Blood donation request stored successfully",
                    insertedId: result.insertedId,
                    data: finalRequestData
                });
            } catch (error) {
                console.error("DB Insertion Error:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.get("/api/donate/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const result = await donate.find({ donarId: id }).toArray();

                // 🌟 ফিক্স: অ্যারে ফাঁকা কিনা তা চেক করার সঠিক নিয়ম (.length === 0)
                if (!result || result.length === 0) {
                    return res.status(404).send({ success: false, message: "No donation history found for this donor" });
                }

                res.status(200).send({ success: true, data: result });
            } catch (error) {
                console.error("DB Find Error:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.get("/api/donors", async (req, res) => {
            try {
                const { bloodGroup, division, district, upazila } = req.query;

                // 🌟 পেজিনেশন প্যারামিটার (ডিফল্ট পেজ = ১, লিমিট = ৮)
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 8;
                const skip = (page - 1) * limit;

                let queryObj = {};
                if (bloodGroup) queryObj.bloodGroup = bloodGroup;
                if (division) queryObj.division = division;
                if (district) queryObj.district = district;
                if (upazila) queryObj.upazila = upazila;

                // ১. ফিল্টার অনুযায়ী মোট ডোনরের সংখ্যা বের করা (বাটন বানানোর জন্য লাগবে)
                const totalDonors = await usersCollection.countDocuments(queryObj);

                // ২. skip এবং limit ব্যবহার করে নির্দিষ্ট পেজের ডাটা আনা
                const result = await usersCollection.find(queryObj)
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                // মোট কয়টি পেজ হবে তার হিসাব
                const totalPages = Math.ceil(totalDonors / limit);

                res.status(200).json({
                    success: true,
                    data: result,
                    pagination: {
                        totalDonors,
                        totalPages,
                        currentPage: page,
                        limit
                    }
                });
            } catch (error) {
                console.error(error);
                res.status(500).json({ success: false, message: "Server Error" });
            }
        });

        console.log("Successfully connected to MongoDB!");
    }
    catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});