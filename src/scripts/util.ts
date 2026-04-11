import * as readline from 'readline';
import { comm, vars } from "../global";
import * as crypto from 'crypto';
import { TOTPHelper } from '../helper/util/totp/totpHelper';
import * as fs from 'node:fs';
import * as path from 'node:path';


let encryptedValue: string = '';
let outputValue: string = '';


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🚪 Process interrupted by user (Ctrl+C)');
  rl.close();
  process.exit(0);
});

async function question(prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prompt, (answer) => {
      // Check for specific exit commands
      if (answer.toLowerCase() === 'exit' ||
        answer.toLowerCase() === 'quit' ||
        answer.toLowerCase() === 'q' ||
        answer === '\u001b') {
        console.log('🚪 Exiting...');
        rl.close();
        process.exit(0);
      }
      resolve(answer);
    });
  });
}

export async function encryptUserInput(): Promise<void> {
  try {
    console.log('🔐 PlayQ Utility Helper\n');
    console.log('💡 Type "exit", "quit", "q", or press Ctrl+C to exit anytime\n');

    console.log('What would you like to do?');
    console.log('1. Password (strong encryption)');
    console.log('2. Text (strong encryption)');
    console.log('3. Decrypt');
    console.log('4. Generate 32bit Key');
    console.log('5. Generate TOTP Code');
    console.log('6. Generate API Schema from OpenAPI');
    console.log('7. Exit');

    const choice = await question('\nEnter your choice (1-7): ');

    switch (choice) {
      case '1':
        await encryptPassword();
        break;
      case '2':
        await encryptText();
        break;
      case '3':
        await decrypt();
        break;
      case '4':
        await generate32ByteKey();
        break;
      case '5':
        await generateTotpCode();
        break;
      case '6':
        await generateApiSchema();
        break;
      case '7':
        console.log('🚪 Goodbye!');
        return;
      default:
        console.log('❌ Invalid choice. Please run again.');
        break;
    }

    // Ask user what to copy to clipboard (only for encryption/decryption operations)
    if (choice !== '6') {  // Skip clipboard for schema generation
      console.log('\nWhat would you like to copy to clipboard?');
      console.log('1. Copy encrypted value');
      console.log('2. Nothing (skip copy)');
      console.log('3. Exit');

      const copyChoice = await question('Enter choice (1-3): ');

      switch (copyChoice) {
        case '1':
          if (encryptedValue) {
            await copyToClipboard(encryptedValue, 'Encrypted Password');
          } else if (outputValue) {
            await copyToClipboard(outputValue, 'Output Value');
          } else {
            console.log('❌ No encrypted / output value to copy');
          }

          break;
        case '2':
          console.log('📋 Skipped copying to clipboard');
          break;
        case '3':
          console.log('🚪 Exiting...');
          break;
        default:
          console.log('❌ Invalid choice');
          break;
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    rl.close();
  }
}

async function copyToClipboard(text: string, description: string): Promise<void> {
  try {
    const clipboardy = await import('clipboardy');
    await clipboardy.default.write(text);
    console.log(`✅ ${description} copied to clipboard!`);
    console.log(`📋 Copied: ${text.length > 50 ? text.substring(0, 50) + '...' : text}`);
  } catch (error) {
    console.error('❌ Failed to copy to clipboard:', error);
    console.log('📝 Manual copy:');
    console.log(text);
  }
}

async function encryptPassword(): Promise<void> {
  const passwordText = await question('Enter password to encrypt (or "exit" to quit): ');

  if (!passwordText) {
    console.log('❌ Password cannot be empty');
    return;
  }

  try {
    console.log('🔄 Encrypting password...');
    encryptedValue = await comm.encryptPassword(passwordText);

    console.log('\n📋 🔐 Encrypted Password Result:');
    console.log('='.repeat(50));
    console.log(encryptedValue);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Encryption failed:', error);
  }
}

async function encryptText(): Promise<void> {
  const encryptText = await question('Enter text to encrypt (or "exit" to quit): ');

  if (!encryptText) {
    console.log('❌ Text cannot be empty');
    return;
  }

  try {
    console.log('🔄 Encrypting text...');
    encryptedValue = await comm.encryptText(encryptText);

    console.log('\n📋 🔐 Encrypted Text Result:');
    console.log('='.repeat(50));
    console.log(encryptedValue);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Encryption failed:', error);
  }
}

async function decrypt(): Promise<void> {
  const decryptText = await question('Enter text to decrypt (or "exit" to quit): ');

  if (!decryptText) {
    console.log('❌ Text cannot be empty');
    return;
  }

  try {
    console.log('🔄 Decrypting text...');
    encryptedValue = await vars.replaceVariables('#{' + decryptText + '}');

    console.log('\n📋 🔓 Decrypted Text Result:');
    console.log('='.repeat(50));
    console.log(encryptedValue);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Decryption failed:', error);
  }
}


async function generate32ByteKey(): Promise<void> {
  try {
    const key = crypto.randomBytes(32).toString('hex');
    encryptedValue = key;
    console.log('\n🔑 32-byte Key Generated:');
    console.log('='.repeat(50));
    console.log(key);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('❌ Failed to generate key:', error);
  }
}

async function generateTotpCode(): Promise<void> {
  try {
    let secretKey = process.env.PLAYQ_TOTP_SECRET_KEY;
    if (!secretKey) {
      const inputSecret = await question('Enter TOTP secret key (or "exit" to quit): ');
      if (!inputSecret) {
        throw new Error('❌ TOTP secret key cannot be empty');
      }
      process.env.PLAYQ_TOTP_SECRET_KEY = inputSecret;
      secretKey = inputSecret;
    }
    if (secretKey.startsWith("enc.")) {
      secretKey = vars.replaceVariables(`#{${secretKey}}`);
    }
    // const secret = crypto.randomBytes(20).toString('hex');
    const totpHelper = new TOTPHelper(secretKey);
    const token = totpHelper.generateToken();
    outputValue = token;
    console.log('\n🔑 TOTP Code Generated:');
    console.log('='.repeat(50));
    console.log(token);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('❌ Failed to generate TOTP code:', error);
  }
}

async function generateApiSchema(): Promise<void> {
  try {
    console.log('\n📋 API Schema Generator');
    console.log('Generate TypeScript schema files from OpenAPI specifications\n');

    console.log('Select input source:');
    console.log('1. URL (HTTP/HTTPS)');
    console.log('2. Local file path');

    const sourceChoice = await question('Enter choice (1-2): ');

    let input: string = '';
    let url: string = '';

    if (sourceChoice === '1') {
      url = await question('Enter OpenAPI JSON URL: ');
      if (!url) {
        console.log('❌ URL cannot be empty');
        return;
      }
    } else if (sourceChoice === '2') {
      input = await question('Enter path to OpenAPI JSON file: ');
      if (!input) {
        console.log('❌ File path cannot be empty');
        return;
      }
    } else {
      console.log('❌ Invalid choice');
      return;
    }

    const outDir = await question('Enter output directory (default: resources/schemas): ') || 'resources/schemas';
    const prefix = await question('Enter export name prefix (optional, e.g., "Api"): ') || '';
    const indexFile = await question('Enter index file name (default: index.ts): ') || 'index.ts';

    console.log('\n🔄 Generating schema files...');

    await generateSchemaFiles({
      input: input || undefined,
      url: url || undefined,
      outDir,
      prefix,
      indexFile
    });

    console.log('✅ Schema generation completed successfully!');
    outputValue = `Schema files generated in: ${path.resolve(outDir)}`;

  } catch (error) {
    console.error('❌ Failed to generate API schema:', error);
  }
}

// Schema generator types and functions
type OpenApiDoc = {
  openapi: string;
  components?: {
    schemas?: Record<string, any>;
  };
};

type SchemaArgs = {
  input?: string;
  url?: string;
  outDir: string;
  prefix: string;
  indexFile: string;
};

async function loadOpenApi(args: SchemaArgs): Promise<OpenApiDoc> {
  if (args.input) {
    const p = path.resolve(args.input);
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  }

  // URL
  const res = await fetch(args.url!, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch OpenAPI JSON from ${args.url}. HTTP ${res.status}`);
  }
  return (await res.json()) as OpenApiDoc;
}

function safeIdent(name: string): string {
  // Make a valid TS identifier-ish name (keeps underscores)
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, "_");
  // Avoid leading digit
  if (/^\d/.test(cleaned)) return "_" + cleaned;
  return cleaned;
}

function exportNameFor(schemaName: string, prefix: string): string {
  // AgentVersion -> AgentVersionSchema, optional prefix -> ApiAgentVersionSchema
  const base = `${schemaName}Schema`;
  return prefix ? `${prefix}${base}` : base;
}

function ensureOutDir(outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
}

function writeSchemaFile(outDir: string, schemaKey: string, exportName: string, schema: any, openapiVersion: string) {
  const fileName = `${schemaKey}.schema.ts`;
  const fullPath = path.join(outDir, fileName);

  const content =
    `/* Auto-generated by PlayQ schema generator - OpenAPI ${openapiVersion} */\n` +
    `/* Source schema: #/components/schemas/${schemaKey} */\n\n` +
    `export const ${exportName} = ${JSON.stringify(schema, null, 2)} as const;\n`;

  fs.writeFileSync(fullPath, content, "utf8");
}

function writeIndexFile(outDir: string, indexFile: string, entries: Array<{ schemaKey: string; exportName: string }>) {
  const fullPath = path.join(outDir, indexFile);
  const lines = entries
    .sort((a, b) => a.schemaKey.localeCompare(b.schemaKey))
    .map(e => `export { ${e.exportName} } from "./${e.schemaKey}.schema";`);

  fs.writeFileSync(fullPath, lines.join("\n") + "\n", "utf8");
}

async function generateSchemaFiles(args: SchemaArgs) {
  const doc = await loadOpenApi(args);

  if (!doc.openapi?.startsWith("3.1")) {
    // still might work, but you said OAS 3.1 and this generator assumes that
    console.warn(`⚠️ OpenAPI version is "${doc.openapi}". Generator is optimised for 3.1.x.`);
  }

  const schemas = doc.components?.schemas ?? {};
  const schemaKeys = Object.keys(schemas);
  if (!schemaKeys.length) {
    throw new Error(`No components.schemas found in the OpenAPI document.`);
  }

  const outDir = path.resolve(args.outDir);
  ensureOutDir(outDir);

  const indexEntries: Array<{ schemaKey: string; exportName: string }> = [];

  for (const rawKey of schemaKeys) {
    const schemaKey = safeIdent(rawKey);
    const exportName = exportNameFor(schemaKey, args.prefix);
    const schema = schemas[rawKey];

    writeSchemaFile(outDir, schemaKey, exportName, schema, doc.openapi);
    indexEntries.push({ schemaKey, exportName });
  }

  writeIndexFile(outDir, args.indexFile, indexEntries);

  console.log(`✅ Generated ${schemaKeys.length} schemas into: ${outDir}`);
  console.log(`✅ Barrel export: ${path.join(outDir, args.indexFile)}`);
}

// Main execution
if (require.main === module) {
  encryptUserInput();
}