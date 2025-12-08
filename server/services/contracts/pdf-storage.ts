/**
 * Contract PDF Storage
 *
 * Manages storage and retrieval of contract PDF files
 * Organizes by tenant for multi-tenancy support
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'fs';

export interface StoredContractInfo {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Contract PDF Storage Service
 */
export class ContractPDFStorage {
  private baseDir: string;

  constructor(baseDir: string = './data/contracts') {
    this.baseDir = baseDir;
  }

  /**
   * Store uploaded PDF contract
   */
  async storeContract(
    fileBuffer: Buffer,
    originalFileName: string,
    tenantId: string,
    contractId: string
  ): Promise<StoredContractInfo> {
    // Create tenant directory
    const tenantDir = path.join(this.baseDir, tenantId);
    await fs.mkdir(tenantDir, { recursive: true });

    // Generate unique file name
    const fileId = uuidv4();
    const ext = path.extname(originalFileName) || '.pdf';
    const storedFileName = `${contractId}_${fileId}${ext}`;
    const filePath = path.join(tenantDir, storedFileName);

    // Write file
    await fs.writeFile(filePath, fileBuffer);

    console.log(`[PDF Storage] Stored contract: ${filePath}`);

    // Return relative path
    const relativePath = `contracts/${tenantId}/${storedFileName}`;

    return {
      filePath: relativePath,
      fileName: storedFileName,
      fileSize: fileBuffer.length,
      mimeType: 'application/pdf'
    };
  }

  /**
   * Retrieve contract PDF
   */
  async getContract(relativePath: string): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, '..', relativePath);

    if (!existsSync(fullPath)) {
      throw new Error('Contract file not found');
    }

    return await fs.readFile(fullPath);
  }

  /**
   * Check if contract exists
   */
  async contractExists(relativePath: string): Promise<boolean> {
    const fullPath = path.join(this.baseDir, '..', relativePath);
    return existsSync(fullPath);
  }

  /**
   * Delete contract PDF
   */
  async deleteContract(relativePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, '..', relativePath);

    if (existsSync(fullPath)) {
      await fs.unlink(fullPath);
      console.log(`[PDF Storage] Deleted contract: ${fullPath}`);
    } else {
      console.warn(`[PDF Storage] Contract not found for deletion: ${fullPath}`);
    }
  }

  /**
   * Get contract file size
   */
  async getContractSize(relativePath: string): Promise<number> {
    const fullPath = path.join(this.baseDir, '..', relativePath);

    if (!existsSync(fullPath)) {
      throw new Error('Contract file not found');
    }

    const stats = await fs.stat(fullPath);
    return stats.size;
  }

  /**
   * List all contracts for a tenant
   */
  async listTenantContracts(tenantId: string): Promise<string[]> {
    const tenantDir = path.join(this.baseDir, tenantId);

    if (!existsSync(tenantDir)) {
      return [];
    }

    const files = await fs.readdir(tenantDir);
    return files.map(file => `contracts/${tenantId}/${file}`);
  }

  /**
   * Clean up old or orphaned contract files
   */
  async cleanupOrphanedFiles(tenantId: string, validContractIds: string[]): Promise<number> {
    const tenantDir = path.join(this.baseDir, tenantId);

    if (!existsSync(tenantDir)) {
      return 0;
    }

    const files = await fs.readdir(tenantDir);
    let deletedCount = 0;

    for (const file of files) {
      // Extract contract ID from filename (format: contractId_uuid.pdf)
      const contractId = file.split('_')[0];

      if (!validContractIds.includes(contractId)) {
        const filePath = path.join(tenantDir, file);
        await fs.unlink(filePath);
        deletedCount++;
        console.log(`[PDF Storage] Deleted orphaned file: ${file}`);
      }
    }

    return deletedCount;
  }
}
