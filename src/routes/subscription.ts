import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from "../controller/subscriptionController";

const router = Router();

// GET all subscriptions for logged-in user
router.get("/", requireAuth, getSubscriptions);

// POST - create a new subscription manually
router.post("/", requireAuth, createSubscription);

// PUT - update subscription details
router.put("/:id", requireAuth, updateSubscription);

// DELETE - remove subscription
router.delete("/:id", requireAuth, deleteSubscription);

export default router;
