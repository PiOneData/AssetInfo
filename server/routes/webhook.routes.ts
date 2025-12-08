import { Router, Request, Response } from "express";
import multer from "multer";
import { validateWebhookAuth, validateEmailData, processEmailToTicket } from "../services/email-to-ticket";

const router = Router();
const upload = multer();

/**
 * @swagger
 * /api/webhook/email-to-ticket:
 *   post:
 *     summary: Webhook endpoint for converting emails to tickets
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Email processed successfully
 *       401:
 *         description: Unauthorized webhook request
 *       400:
 *         description: Invalid email data
 *       500:
 *         description: Internal server error
 */
router.post("/email-to-ticket", upload.any(), async (req: Request, res: Response) => {
  try {
    console.log("Received email webhook:", {
      from: req.body.from,
      to: req.body.to,
      subject: req.body.subject
    });

    // Basic webhook validation
    if (!validateWebhookAuth(req)) {
      console.warn("Unauthorized webhook request blocked");
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Validate email data
    const emailData = validateEmailData(req.body);
    if (!emailData) {
      console.error("Invalid email data received");
      return res.status(400).json({ message: "Invalid email data" });
    }

    // Process email to create ticket
    const result = await processEmailToTicket(emailData);

    if (result.success) {
      console.log(`Successfully created ticket ${result.ticketId} from email`);
      res.status(200).json({
        message: "Ticket created successfully",
        ticketId: result.ticketId
      });
    } else {
      console.warn(`Failed to create ticket from email: ${result.error}`);
      // Still return 200 to prevent SendGrid retries for user errors
      res.status(200).json({
        message: "Email received but ticket creation failed",
        error: result.error
      });
    }

  } catch (error) {
    console.error("Error processing email webhook:", error);
    // Return 500 to trigger SendGrid retry for system errors
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
