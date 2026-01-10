#!/usr/bin/env node
/**
 * V7 Test File Generator
 * Creates test files for all discovered formats
 */

import fs from 'fs';
import path from 'path';

export class V7TestGenerator {
  constructor(outputDir = 'test-files') {
    this.outputDir = outputDir;
    this.testFiles = [];
  }

  /**
   * Generate test files for all formats
   */
  async generate(formats) {
    console.log('\n=== GENERATING TEST FILES ===\n');

    // Create output directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    for (const format of formats) {
      try {
        const testFile = await this.createTestFile(format);
        if (testFile) {
          this.testFiles.push(testFile);
          console.log(`  ✅ ${format.padEnd(10)} → ${testFile.path}`);
        }
      } catch (err) {
        console.log(`  ⚠️  ${format.padEnd(10)} → Skipped (${err.message})`);
      }
    }

    console.log(`\nGenerated ${this.testFiles.length}/${formats.length} test files`);
    return this.testFiles;
  }

  /**
   * Create test file for specific format
   */
  async createTestFile(format) {
    const filename = `test.${format}`;
    const filepath = path.join(this.outputDir, filename);

    // Get test data for format
    const data = this.getTestData(format);
    if (!data) return null;

    // Write file
    fs.writeFileSync(filepath, data);

    return {
      format: format,
      path: filepath,
      filename: filename,
      size: data.length,
      mimeType: this.getMimeType(format)
    };
  }

  /**
   * Get test data for format (minimal valid file)
   */
  getTestData(format) {
    // Minimal valid image data for common formats
    const testData = {
      // PNG: 1x1 red pixel
      png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'),

      // JPG: 1x1 red pixel
      jpg: Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=', 'base64'),

      // GIF: 1x1 red pixel
      gif: Buffer.from('R0lGODlhAQABAPAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'),

      // WebP: 1x1 red pixel
      webp: Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64'),

      // BMP: 1x1 red pixel
      bmp: Buffer.from('Qk1GAAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAAAAADEDgAAxA4AAAAAAAAAAAAA/wAAAA==', 'base64'),

      // TIFF: Minimal header
      tiff: Buffer.from('SUkqAAgAAAAA', 'base64'),

      // SVG: Minimal valid SVG
      svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="red"/></svg>'),

      // HEIC: Minimal HEIC header (magic bytes)
      heic: Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x20]), // size
        Buffer.from('ftypheic'), // brand
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // version
        Buffer.from('heicmif1'), // compatible brands
        Buffer.from([0x00, 0x00, 0x00, 0x08]), // mdat size
        Buffer.from('mdat') // data
      ]),

      // JXL: JPEG XL magic bytes
      jxl: Buffer.from([0xFF, 0x0A, 0x00, 0x00, 0x00, 0x00]),

      // AVIF: AVIF header
      avif: Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x20]),
        Buffer.from('ftypavif'),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from('avifmif1')
      ]),

      // PSD: Photoshop header
      psd: Buffer.concat([
        Buffer.from('8BPS'), // signature
        Buffer.from([0x00, 0x01]), // version
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // reserved
      ]),

      // XCF: GIMP header
      xcf: Buffer.from('gimp xcf v011\0'),

      // PDF: Minimal PDF
      pdf: Buffer.from('%PDF-1.4\n%EOF'),

      // RAW formats - use TIFF-based header (many RAW formats are TIFF-based)
      cr2: Buffer.from('SUkqAAgAAAAA', 'base64'), // Canon
      nef: Buffer.from('SUkqAAgAAAAA', 'base64'), // Nikon
      arw: Buffer.from('SUkqAAgAAAAA', 'base64'), // Sony
      dng: Buffer.from('SUkqAAgAAAAA', 'base64'), // Adobe
      raf: Buffer.from('FUJIFILMCCD-RAW', 'ascii'), // Fuji
      orf: Buffer.from('IIRO\x08\x00\x00\x00', 'ascii') // Olympus
    };

    // Return test data or null if not available
    return testData[format.toLowerCase()] || testData[format] || null;
  }

  /**
   * Get MIME type for format
   */
  getMimeType(format) {
    const mimeTypes = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
      tif: 'image/tiff',
      svg: 'image/svg+xml',
      heic: 'image/heic',
      heif: 'image/heif',
      avif: 'image/avif',
      jxl: 'image/jxl',
      psd: 'image/vnd.adobe.photoshop',
      xcf: 'image/x-xcf',
      pdf: 'application/pdf',
      cr2: 'image/x-canon-cr2',
      nef: 'image/x-nikon-nef',
      arw: 'image/x-sony-arw',
      dng: 'image/x-adobe-dng',
      raf: 'image/x-fuji-raf',
      orf: 'image/x-olympus-orf'
    };

    return mimeTypes[format.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Generate manifest of test files
   */
  generateManifest() {
    const manifest = {
      timestamp: new Date().toISOString(),
      totalFiles: this.testFiles.length,
      files: this.testFiles.map(file => ({
        format: file.format,
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size
      }))
    };

    const manifestPath = path.join(this.outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`\nManifest saved to: ${manifestPath}`);
    return manifest;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const analysisReportPath = process.argv[2] || 'v7-analysis-report.json';

  console.log('V7 Test File Generator');
  console.log('======================\n');

  // Load analysis report
  const report = JSON.parse(fs.readFileSync(analysisReportPath, 'utf-8'));
  const formats = report.features.fileFormats;

  console.log(`Loaded ${formats.length} formats from analysis report`);

  // Generate test files
  const generator = new V7TestGenerator();
  await generator.generate(formats);
  generator.generateManifest();
}
