import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import {
  insertTicketSchema,
  updateTicketSchema,
  insertTicketCommentSchema
} from "@shared/schema";
import { z } from "zod";

const router = Router();

/**
 * @swagger
 * /api/tickets:
 *   get:
 *     summary: Get tickets based on user role
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tickets retrieved successfully
 *       403:
 *         description: Invalid role
 */
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    let tickets;

    // Role-based access control
    switch (user.role) {
      case "employee":
        // Employees can only see their own tickets
        tickets = await storage.getTicketsByRequestor(user.userId, user.tenantId);
        break;
      case "technician":
        // Technicians can see tickets assigned to them
        tickets = await storage.getTicketsByAssignee(user.userId, user.tenantId);
        break;
      case "manager":
      case "admin":
        // Managers and admins can see all tickets in their tenant
        tickets = await storage.getAllTickets(user.tenantId);
        break;
      default:
        return res.status(403).json({ message: "Invalid role" });
    }

    res.json(tickets);
  } catch (error) {
    console.error("Failed to fetch tickets:", error);
    res.status(500).json({ message: "Failed to fetch tickets" });
  }
});

/**
 * @swagger
 * /api/tickets/{id}:
 *   get:
 *     summary: Get specific ticket by ID
 *     tags: [Tickets]
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
 *         description: Ticket retrieved successfully
 *       404:
 *         description: Ticket not found
 *       403:
 *         description: Access denied
 */
router.get("/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const ticketId = req.params.id;

    const ticket = await storage.getTicket(ticketId, user.tenantId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Role-based access control
    const canAccess = user.role === "admin" ||
      user.role === "manager" ||
      ticket.requestorId === user.userId ||
      ticket.assignedToId === user.userId;

    if (!canAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(ticket);
  } catch (error) {
    console.error("Failed to fetch ticket:", error);
    res.status(500).json({ message: "Failed to fetch ticket" });
  }
});

/**
 * @swagger
 * /api/tickets:
 *   post:
 *     summary: Create new ticket
 *     tags: [Tickets]
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
 *         description: Ticket created successfully
 */
router.post("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    // Get full user details for name
    const fullUser = await storage.getUser(user.userId);
    if (!fullUser || fullUser.tenantId !== user.tenantId) {
      return res.status(401).json({ message: "User not found" });
    }

    // Parse and validate request body
    const ticketData = insertTicketSchema.parse({
      ...req.body,
      requestorId: user.userId,
      requestorName: `${fullUser.firstName} ${fullUser.lastName}`,
      tenantId: user.tenantId
    });

    const ticket = await storage.createTicket(ticketData);
    res.status(201).json(ticket);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid ticket data",
        errors: error.errors
      });
    }
    console.error("Failed to create ticket:", error);
    res.status(500).json({ message: "Failed to create ticket" });
  }
});

/**
 * @swagger
 * /api/tickets/{id}:
 *   put:
 *     summary: Update ticket details
 *     tags: [Tickets]
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
 *         description: Ticket updated successfully
 */
router.put("/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const ticketId = req.params.id;

    // Check if ticket exists and user has access
    const existingTicket = await storage.getTicket(ticketId, user.tenantId);
    if (!existingTicket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Role-based access control
    const canUpdate = user.role === "admin" ||
      user.role === "manager" ||
      existingTicket.requestorId === user.userId;

    if (!canUpdate) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Parse and validate update data (only description, category, priority, assetId, assetName allowed)
    const updateData = updateTicketSchema.parse(req.body);

    const updatedTicket = await storage.updateTicket(ticketId, user.tenantId, updateData);
    res.json(updatedTicket);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid update data",
        errors: error.errors
      });
    }
    console.error("Failed to update ticket:", error);
    res.status(500).json({ message: "Failed to update ticket" });
  }
});

/**
 * @swagger
 * /api/tickets/{id}/assign:
 *   put:
 *     summary: Assign ticket to a user (Manager only)
 *     tags: [Tickets]
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
 *         description: Ticket assigned successfully
 */
router.put("/:id/assign", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const ticketId = req.params.id;
    const { assignedToId, assignedToName } = req.body;

    if (!assignedToId || !assignedToName) {
      return res.status(400).json({ message: "assignedToId and assignedToName are required" });
    }

    // Verify the assignee exists and belongs to the same tenant
    const assignee = await storage.getUser(assignedToId);
    if (!assignee || assignee.tenantId !== user.tenantId) {
      return res.status(400).json({ message: "Invalid assignee" });
    }

    // Get full user details for name
    const fullUser = await storage.getUser(user.userId);
    if (!fullUser || fullUser.tenantId !== user.tenantId) {
      return res.status(401).json({ message: "User not found" });
    }

    const updatedTicket = await storage.assignTicket(
      ticketId,
      user.tenantId,
      assignedToId,
      assignedToName,
      user.userId,
      `${fullUser.firstName} ${fullUser.lastName}`
    );

    if (!updatedTicket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.json(updatedTicket);
  } catch (error) {
    console.error("Failed to assign ticket:", error);
    res.status(500).json({ message: "Failed to assign ticket" });
  }
});

/**
 * @swagger
 * /api/tickets/{id}/status:
 *   put:
 *     summary: Update ticket status (Technician and above)
 *     tags: [Tickets]
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
 *         description: Ticket status updated successfully
 */
router.put("/:id/status", authenticateToken, requireRole("technician"), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const ticketId = req.params.id;
    const { status, resolution, resolutionNotes } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    // Check if ticket exists and user has access
    const existingTicket = await storage.getTicket(ticketId, user.tenantId);
    if (!existingTicket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Role-based access control
    const canUpdateStatus = user.role === "admin" ||
      user.role === "manager" ||
      existingTicket.assignedToId === user.userId;

    if (!canUpdateStatus) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedTicket = await storage.updateTicketStatus(
      ticketId,
      user.tenantId,
      status,
      resolution,
      resolutionNotes
    );

    res.json(updatedTicket);
  } catch (error) {
    console.error("Failed to update ticket status:", error);
    res.status(500).json({ message: "Failed to update ticket status" });
  }
});

/**
 * @swagger
 * /api/tickets/{id}:
 *   delete:
 *     summary: Delete ticket (Admin only)
 *     tags: [Tickets]
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
 *         description: Ticket deleted successfully
 */
router.delete("/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const ticketId = req.params.id;

    const success = await storage.deleteTicket(ticketId, user.tenantId);
    if (!success) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.json({ message: "Ticket deleted successfully" });
  } catch (error) {
    console.error("Failed to delete ticket:", error);
    res.status(500).json({ message: "Failed to delete ticket" });
  }
});

/**
 * @swagger
 * /api/tickets/{id}/comments:
 *   get:
 *     summary: Get all comments for a ticket
 *     tags: [Tickets]
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
 *         description: Comments retrieved successfully
 */
router.get("/:id/comments", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const ticketId = req.params.id;

    // Check if ticket exists and user has access
    const ticket = await storage.getTicket(ticketId, user.tenantId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const canAccess = user.role === "admin" ||
      user.role === "manager" ||
      ticket.requestorId === user.userId ||
      ticket.assignedToId === user.userId;

    if (!canAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const comments = await storage.getTicketComments(ticketId, user.tenantId);
    res.json(comments);
  } catch (error) {
    console.error("Failed to fetch ticket comments:", error);
    res.status(500).json({ message: "Failed to fetch ticket comments" });
  }
});

/**
 * @swagger
 * /api/tickets/{id}/comments:
 *   post:
 *     summary: Add a comment to a ticket
 *     tags: [Tickets]
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
 *       201:
 *         description: Comment added successfully
 */
router.post("/:id/comments", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const ticketId = req.params.id;

    // Check if ticket exists and user has access
    const ticket = await storage.getTicket(ticketId, user.tenantId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const canComment = user.role === "admin" ||
      user.role === "manager" ||
      ticket.requestorId === user.userId ||
      ticket.assignedToId === user.userId;

    if (!canComment) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get full user details for name
    const fullUser = await storage.getUser(user.userId);
    if (!fullUser || fullUser.tenantId !== user.tenantId) {
      return res.status(401).json({ message: "User not found" });
    }

    // Parse and validate comment data
    const commentData = insertTicketCommentSchema.parse({
      ...req.body,
      ticketId,
      authorId: user.userId,
      authorName: `${fullUser.firstName} ${fullUser.lastName}`,
      authorRole: user.role,
      tenantId: user.tenantId
    });

    const comment = await storage.addTicketComment(commentData);
    res.status(201).json(comment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid comment data",
        errors: error.errors
      });
    }
    console.error("Failed to add ticket comment:", error);
    res.status(500).json({ message: "Failed to add ticket comment" });
  }
});

/**
 * @swagger
 * /api/tickets/{id}/comments/{commentId}:
 *   put:
 *     summary: Update a ticket comment
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: commentId
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
 *         description: Comment updated successfully
 */
router.put("/:id/comments/:commentId", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const commentId = req.params.commentId;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: "Content is required" });
    }

    const updatedComment = await storage.updateTicketComment(commentId, user.tenantId, content);
    if (!updatedComment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    res.json(updatedComment);
  } catch (error) {
    console.error("Failed to update ticket comment:", error);
    res.status(500).json({ message: "Failed to update ticket comment" });
  }
});

/**
 * @swagger
 * /api/tickets/{id}/comments/{commentId}:
 *   delete:
 *     summary: Delete a ticket comment
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comment deleted successfully
 */
router.delete("/:id/comments/:commentId", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const commentId = req.params.commentId;

    const success = await storage.deleteTicketComment(commentId, user.tenantId);
    if (!success) {
      return res.status(404).json({ message: "Comment not found" });
    }

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Failed to delete ticket comment:", error);
    res.status(500).json({ message: "Failed to delete ticket comment" });
  }
});

/**
 * @swagger
 * /api/tickets/{id}/activities:
 *   get:
 *     summary: Get ticket activity log
 *     tags: [Tickets]
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
 *         description: Activities retrieved successfully
 */
router.get("/:id/activities", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const ticketId = req.params.id;

    // Check if ticket exists and user has access
    const ticket = await storage.getTicket(ticketId, user.tenantId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const canAccess = user.role === "admin" ||
      user.role === "manager" ||
      ticket.requestorId === user.userId ||
      ticket.assignedToId === user.userId;

    if (!canAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const activities = await storage.getTicketActivities(ticketId, user.tenantId);
    res.json(activities);
  } catch (error) {
    console.error("Failed to fetch ticket activities:", error);
    res.status(500).json({ message: "Failed to fetch ticket activities" });
  }
});

export default router;
