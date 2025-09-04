import express from "express";

export default function usersRoutes(db) {
  const router = express.Router();
  const usersCollection = db.collection("users");
  router.put("/:email", async (req, res) => {
    try {
      const { email } = req.params;

      if (!req.decodedEmail || email !== req.decodedEmail) {
        return res.status(403).json({ message: "Forbidden Access" });
      }

      const updateDoc = {
        $set: {
          uid: req.userId,
          email: req.decodedEmail,
          name: req.body.name,
          photo: req.body.photo || "https://i.ibb.co/5GzXkwq/user.png",
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      };

      const result = await usersCollection.updateOne(
        { email: req.decodedEmail },
        updateDoc,
        { upsert: true }
      );

      return res.json({ message: "User saved successfully", result });
    } catch (err) {
      console.error("User PUT error:", err);
      return res.status(500).json({ message: "Failed to save user", error: err.message });
    }
  });

  // Get current user
  router.get("/me", async (req, res) => {
    try {
      const user = await usersCollection.findOne({ email: req.decodedEmail });
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (err) {
      res.status(500).json({ message: "Failed to get user", error: err.message });
    }
  });

  return router;
}