import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * @swagger
 * /api/vendors:
 *   get:
 *     summary: Get all vendors
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vendors retrieved successfully
 */
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const vendors = await storage.getMasterData(req.user!.tenantId, "vendor");
    res.json(vendors);
  } catch (error) {
    console.error('Failed to fetch vendors:', error);
    res.status(500).json({ message: "Failed to fetch vendors" });
  }
});

/**
 * @swagger
 * /api/vendors:
 *   post:
 *     summary: Create a new vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Vendor created successfully
 */
router.post("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { value, description } = req.body;
    if (!value || value.trim() === '') {
      return res.status(400).json({ message: "Vendor name is required" });
    }

    const vendor = await storage.createMasterData({
      type: "vendor",
      value: value.trim(),
      description: description || "",
      tenantId: req.user!.tenantId
    });

    res.status(201).json(vendor);
  } catch (error) {
    console.error('Failed to create vendor:', error);
    res.status(500).json({ message: "Failed to create vendor" });
  }
});

/**
 * @swagger
 * /api/vendors/{id}:
 *   put:
 *     summary: Update a vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Vendor updated successfully
 */
router.put("/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { value, description } = req.body;
    if (!value || value.trim() === '') {
      return res.status(400).json({ message: "Vendor name is required" });
    }

    const vendor = await storage.updateMasterData(req.params.id, req.user!.tenantId, {
      value: value.trim(),
      description: description || ""
    });

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.json(vendor);
  } catch (error) {
    console.error('Failed to update vendor:', error);
    res.status(500).json({ message: "Failed to update vendor" });
  }
});

/**
 * @swagger
 * /api/vendors/{id}:
 *   delete:
 *     summary: Delete a vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vendor deleted successfully
 */
router.delete("/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const success = await storage.deleteMasterData(req.params.id, req.user!.tenantId);
    if (!success) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    res.json({ message: "Vendor deleted successfully" });
  } catch (error) {
    console.error('Failed to delete vendor:', error);
    res.status(500).json({ message: "Failed to delete vendor" });
  }
});

export default router;
