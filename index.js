const express = require("express");
require("dotenv").config();
const port = process.env.PORT || 5001;
var cors = require("cors");
const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // CRITICAL: ক্লায়েন্ট সাইডের বডি ডাটা রিড করার জন্য এটি লাগবে

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.PRIVATE_DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const throughError = (error) => {
  if (error?.message) {
    return error.message;
  }
  return "Internal Server Error";
};

console.log("Successfully connected to MongoDB!");

const database = client.db("blood_donor");
const sessionCollection = database.collection("session");
const usersData = database.collection("user");

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  // console.log("authHeader", authHeader)
  if (!authHeader) {
      return res.status(401).send({ message: 'unauthorized access' })
  }
  const token = authHeader.split(' ')[1]
  if (!token) {
      return res.status(401).send({ message: 'unauthorized access' })
  }
  const query = { token: token }
  const session = await sessionCollection.findOne(query);

  if (!session) {
      return res.status(401).send({ message: 'unauthorized access' })
  }
  const userId = session.userId;
  const userQuery = { _id: userId }
  const user = await usersData.findOne(userQuery);

  if (!user) {
      return res.status(401).send({ message: 'unauthorized access' })
  }
  req.user = user;
  next();

};

const verifyDonor = async (req, res, next) => {
  if (req.user?.role !== 'donor' && req.user?.role !== 'user') {
      return res.status(403).send({ message: 'forbidden access' })
  }
  next();
};

const verifyAdminOrVolunteer = (req, res, next) => {
  if (req.user?.role !== 'volunteer' && req.user?.role !== 'admin') {
      return res.status(403).send({ message: 'forbidden access' })
  }
  next();
};

const verifyVolunteer = async (req, res, next) => {
  if (req.user?.role !== 'volunteer') {
      return res.status(403).send({ message: 'forbidden access' })
  }
  next();
};

const verifyAdmin = async (req, res, next) => {
  if (req.user.role !== 'admin') {
      return res.status(403).send({ message: 'forbidden access' })
  }
  next();
};

app.get("/", (req, res) => {
  res.send("hello this is donor API running");
});

const payment = database.collection("payment");

app.post("/api/payment", async (req, res) => {
  try {
    const paymentData = req.body;
    const result = await payment.insertOne(paymentData);
    res.status(201).send({
      success: true,
      message: "User additional metadata stored successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("DB Insertion Error:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
});

app.get("/api/payment", verifyToken, async (req, res) => {
  const result = await payment.find().toArray();
  res.json(result);
});

const usersCollection = database.collection("users_profile");
app.post("/api/user/save-details", verifyToken, async (req, res) => {
  try {
    const profileData = req.body;
    const profileResult = await usersCollection.insertOne(profileData);
    await usersData.updateOne(
      { _id: new ObjectId(profileData.userId) },
      { $set: { role: "donor" } },
    );

    res.status(201).send({
      success: true,
      message: "User profile saved and role updated successfully.",
      insertedId: profileResult.insertedId,
    });
  } catch (error) {
    console.error("DB Error:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
});

app.get("/api/user/save-details/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const result = await usersCollection.findOne({ userId: id });
  res.json(result);
});

app.get("/api/user/save-details", async (req, res) => {
  const result = await usersCollection.find().toArray();
  res.json(result);
});

app.patch("/api/user/save-details/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    delete updatedData._id;
    delete updatedData.userId;

    const profileResult = await usersCollection.updateOne(
      { userId: id },
      { $set: updatedData },
      { upsert: true },
    );

    if (updatedData.role) {
      await usersData.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: updatedData.role } },
      );
    }

    res.status(200).json({
      success: true,
      message: "User profile and system role updated successfully.",
      modifiedCount: profileResult.modifiedCount,
    });
  } catch (error) {
    console.error("Update DB Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

const request = database.collection("request");
app.post("/api/request", verifyToken, async (req, res) => {
  try {
    const bloodRequestData = req.body;
    const finalRequestData = { ...bloodRequestData, createdAt: new Date() };
    const result = await request.insertOne(finalRequestData);

    res.status(201).send({
      success: true,
      message: "Blood donation request stored successfully",
      insertedId: result.insertedId,
      data: finalRequestData,
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
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }
    const result = await request
      .find({ userId: userId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(result);
  } catch (error) {
    console.error("Fetch User Requests Error:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
});

app.get("/api/request", async (req, res) => {
  try {
    const { bloodGroup, division, district, upazila } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;

    let queryObj = {};
    if (bloodGroup) queryObj.bloodGroup = bloodGroup;
    if (division) queryObj.division = division;
    if (district) queryObj.district = district;
    if (upazila) queryObj.upazila = upazila;

    const totalRequests = await request.countDocuments(queryObj);
    const result = await request
      .find(queryObj)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalPages = Math.ceil(totalRequests / limit);

    res.status(200).json({
      success: true,
      data: result,
      pagination: { totalRequests, totalPages, currentPage: page, limit },
    });
  } catch (error) {
    console.error("Fetch Filtered Requests Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

app.get("/api/request/:id",verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await request.findOne({ _id: new ObjectId(id) });

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }
    res.json(result);
  } catch (error) {
    console.error("Fetch Request Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

app.patch("/api/request/update/:id",verifyToken,verifyAdminOrVolunteer, async (req, res) => {
  try {
    const { id } = req.params;

    const {
      donorId,
      status,
      patientName,
      bloodGroup,
      hospitalName,
      neededDate,
      neededTime,
    } = req.body;

    console.log(req.body);

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Request ID format" });
    }

    const updateData = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (donorId) updateData.acceptedBy = donorId;
    if (patientName) updateData.patientName = patientName;
    if (bloodGroup) updateData.bloodGroup = bloodGroup;
    if (hospitalName) updateData.hospitalName = hospitalName;
    if (neededDate) updateData.neededDate = neededDate;
    if (neededTime) updateData.neededTime = neededTime;

    const result = await request.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateData },
      { returnDocument: "after" },
    );

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "Blood request not found" });
    }

    res.json({
      success: true,
      message: "Request updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update Request Error:", error);
    res.status(500).json({ success: false, message: throughError(error) });
  }
});

app.delete(
  "/api/request/delete/:id",
  verifyToken,
  verifyAdminOrVolunteer,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid Request ID format" });
      }

      const result = await request.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        return res
          .status(404)
          .json({
            success: false,
            message: "Request not found or already deleted",
          });
      }

      res.json({
        success: true,
        message: "Blood request deleted successfully",
      });
    } catch (error) {
      console.error("Delete Request Error:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
    }
  },
);

const donate = database.collection("donate");
app.post("/api/donate", verifyToken, async (req, res) => {
  try {
    const bloodRequestData = req.body;

    const finalRequestData = { ...bloodRequestData, createdAt: new Date() };
    const result = await donate.insertOne(finalRequestData);

    res.status(201).send({
      success: true,
      message: "Blood donation request stored successfully",
      insertedId: result.insertedId,
      data: finalRequestData,
    });
  } catch (error) {
    console.error("DB Insertion Error:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
});

app.get("/api/donate/:id",verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await donate.find({ donarId: id }).toArray();

    if (!result || result.length === 0) {
      return res
        .status(404)
        .send({
          success: false,
          message: "No donation history found for this donor",
        });
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    let queryObj = {};
    if (bloodGroup) queryObj.bloodGroup = bloodGroup;
    if (division) queryObj.division = division;
    if (district) queryObj.district = district;
    if (upazila) queryObj.upazila = upazila;

    const totalDonors = await usersCollection.countDocuments(queryObj);
    const result = await usersCollection
      .find(queryObj)
      .skip(skip)
      .limit(limit)
      .toArray();
    const totalPages = Math.ceil(totalDonors / limit);

    res.status(200).json({
      success: true,
      data: result,
      pagination: { totalDonors, totalPages, currentPage: page, limit },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// লোকাল হোস্ট এনভায়রনমেন্টের জন্য listen চালু রাখা
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app;
