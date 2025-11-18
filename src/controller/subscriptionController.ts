import { Request, Response } from "express";
import { prisma } from "../prisma";

export const getSubscriptions = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const subs = await prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
};

export const createSubscription = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const {
      provider,
      product,
      amount,
      currency,
      startDate,
      expiryDate,
      nextBilling,
    } = req.body;

    const newSub = await prisma.subscription.create({
      data: {
        userId,
        provider,
        product,
        amount,
        currency,
        startDate: startDate ? new Date(Date.now()) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        nextBilling: nextBilling ? new Date(nextBilling) : null,
      },
    });

    res.status(201).json(newSub);
  } catch (err) {
    res.status(500).json({ error: "Failed to create subscription" });
  }
};

export const updateSubscription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updated = await prisma.subscription.update({
      where: { id },
      data: updates,
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update subscription" });
  }
};

export const deleteSubscription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.subscription.delete({
      where: { id },
    });

    res.json({ message: "Subscription deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete subscription" });
  }
};
