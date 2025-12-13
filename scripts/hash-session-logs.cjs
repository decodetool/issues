#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');
const path = require('path');

/**
 * Hash Base64 Session Log Processor
 *
 * Processes Claude Code JSONL session files and replaces base64-encoded
 * image data with SHA-256 hashes to reduce file size while preserving
 * metadata structure.
 */

// Hash function using SHA-256
function hashData(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Recursive function to find and hash base64 data in objects
function processObject(obj) {
  if (obj === null || obj === undefined) {
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach(item => processObject(item));
  } else if (typeof obj === 'object') {
    // Check if this object has base64 data to hash
    if (obj.type === 'base64' && typeof obj.data === 'string' && obj.data.length > 100) {
      // Hash the base64 data
      obj.data = hashData(obj.data);
    }

    // Recursively process all properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        processObject(obj[key]);
      }
    }
  }
}

// Main processing function
async function processJsonlFile(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    // Get input filename and create output path
    const inputFilename = path.basename(inputPath);
    const outputFilename = inputFilename.replace('.jsonl', '.hashed.jsonl');
    const outputPath = path.join(outputDir, outputFilename);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`Created output directory: ${outputDir}`);
    }

    // Create read stream and readline interface
    const fileStream = fs.createReadStream(inputPath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    // Create write stream for output
    const outputStream = fs.createWriteStream(outputPath, { encoding: 'utf8' });

    let lineCount = 0;
    let processedCount = 0;
    let errorCount = 0;

    rl.on('line', (line) => {
      lineCount++;

      try {
        // Parse JSON line
        const jsonObj = JSON.parse(line);

        // Process object to hash base64 data
        processObject(jsonObj);

        // Write modified JSON to output file
        outputStream.write(JSON.stringify(jsonObj) + '\n');
        processedCount++;

        // Progress feedback every 100 lines
        if (lineCount % 100 === 0) {
          process.stdout.write(`\rProcessed ${lineCount} lines...`);
        }
      } catch (error) {
        errorCount++;
        console.error(`\nError parsing line ${lineCount}: ${error.message}`);
        // Write original line to preserve data
        outputStream.write(line + '\n');
      }
    });

    rl.on('close', () => {
      outputStream.end();

      // Get file sizes
      const inputStats = fs.statSync(inputPath);
      const outputStats = fs.statSync(outputPath);
      const reduction = ((1 - outputStats.size / inputStats.size) * 100).toFixed(2);

      console.log(`\n\n✅ Processing complete!`);
      console.log(`   Input file:  ${inputPath}`);
      console.log(`   Output file: ${outputPath}`);
      console.log(`   Lines processed: ${processedCount}`);
      console.log(`   Errors: ${errorCount}`);
      console.log(`   Input size:  ${(inputStats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Output size: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Size reduction: ${reduction}%`);

      resolve({
        linesProcessed: processedCount,
        errors: errorCount,
        inputSize: inputStats.size,
        outputSize: outputStats.size,
        outputPath
      });
    });

    rl.on('error', (error) => {
      outputStream.end();
      reject(error);
    });

    fileStream.on('error', (error) => {
      reject(error);
    });
  });
}

// CLI Entry Point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Hash Base64 Session Log Processor
==================================

Processes Claude Code JSONL session files and replaces base64-encoded
image data with SHA-256 hashes to reduce file size.

Usage:
  node hash-session-logs.js <input-file> [output-directory]

Arguments:
  <input-file>        Full path to the JSONL file to process
  [output-directory]  Optional output directory
                      Default: .claude-session-logs in current directory

Examples:
  # Process a Claude session file (output to default directory)
  node scripts/hash-session-logs.js ~/.claude/projects/my-session.jsonl

  # Specify custom output directory
  node scripts/hash-session-logs.js input.jsonl /path/to/output/

  # Process with relative path
  node scripts/hash-session-logs.js ./data/session.jsonl
`);
    process.exit(0);
  }

  const inputPath = path.resolve(args[0]);
  const defaultOutputDir = path.join(process.cwd(), '.claude-session-logs');
  const outputDir = args[1] ? path.resolve(args[1]) : defaultOutputDir;

  console.log('Hash Base64 Session Log Processor');
  console.log('==================================\n');
  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputDir}\n`);

  try {
    await processJsonlFile(inputPath, outputDir);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = { hashData, processObject, processJsonlFile };
