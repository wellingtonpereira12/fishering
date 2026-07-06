import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root123",
  database: process.env.DB_NAME || "fishering",
  port: parseInt(process.env.DB_PORT || "3306"),
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

// Helper to calculate coupon discount
function getCouponDiscount(productPrice, coupon) {
  if (coupon.minProductPrice !== null && productPrice < coupon.minProductPrice) {
    return 0;
  }
  
  let discount = 0;
  if (coupon.type === 'percentage') {
    discount = productPrice * (coupon.value / 100);
  } else if (coupon.type === 'fixed') {
    discount = coupon.value;
  }
  
  if (coupon.maxDiscount !== null && discount > coupon.maxDiscount) {
    discount = coupon.maxDiscount;
  }
  
  return Math.min(discount, productPrice);
}

// Helper to find the coupon that gives the highest discount
function getBestCouponForProduct(productPrice, coupons) {
  let bestCoupon = null;
  let maxDiscount = 0;
  
  for (const coupon of coupons) {
    const discount = getCouponDiscount(productPrice, coupon);
    if (discount > maxDiscount) {
      maxDiscount = discount;
      bestCoupon = coupon;
    }
  }
  
  return bestCoupon;
}

// Initialize MCP Server
const server = new Server(
  {
    name: "fishering-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "fishering_list_products",
        description: "Lists all products in the Fishering database with dynamic coupon calculations applied.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "fishering_add_product",
        description: "Adds a new product to the Fishering database.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title of the product" },
            image: { type: "string", description: "Image URL of the product" },
            price: { type: "number", description: "Current price of the product in BRL" },
            originalPrice: { type: "number", description: "Original/previous price in BRL (optional)" },
            url: { type: "string", description: "Store link/URL of the product" },
            category: { type: "string", description: "Category name (optional, e.g. Molinete, Varas, Iscas)" },
            store: { type: "string", description: "Store name (optional, e.g. Mercado Livre, Amazon)" },
          },
          required: ["title", "image", "price", "url"],
        },
      },
      {
        name: "fishering_delete_product",
        description: "Deletes a product by its ID.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID of the product to delete" },
          },
          required: ["id"],
        },
      },
      {
        name: "fishering_list_coupons",
        description: "Lists all discount coupons currently active.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "fishering_add_coupon",
        description: "Creates or updates a discount coupon in the database.",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string", description: "The coupon code (e.g. PESCA20)" },
            type: { type: "string", description: "Type of coupon: 'fixed' or 'percentage'" },
            value: { type: "number", description: "Discount value (percentage number or fixed amount)" },
            maxDiscount: { type: "number", description: "Maximum discount cap in BRL (optional)" },
            minProductPrice: { type: "number", description: "Minimum product price to qualify for this coupon (optional)" },
          },
          required: ["code", "type", "value"],
        },
      },
      {
        name: "fishering_delete_coupon",
        description: "Deletes a discount coupon by its code.",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string", description: "The coupon code to delete" },
          },
          required: ["code"],
        },
      },
    ],
  };
});

// Call Tools Implementation
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "fishering_list_products": {
        const [productRows] = await pool.query("SELECT * FROM products ORDER BY createdAt DESC");
        const [couponRows] = await pool.query("SELECT * FROM coupons");

        const coupons = couponRows.map(r => ({
          ...r,
          value: parseFloat(r.value),
          maxDiscount: r.maxDiscount !== null ? parseFloat(r.maxDiscount) : null,
          minProductPrice: r.minProductPrice !== null ? parseFloat(r.minProductPrice) : 0.00
        }));

        const products = productRows.map(r => {
          const price = parseFloat(r.price);
          const originalPrice = r.originalPrice !== null ? parseFloat(r.originalPrice) : null;
          const bestCoupon = getBestCouponForProduct(price, coupons);

          return {
            ...r,
            price,
            originalPrice,
            coupon: bestCoupon ? bestCoupon.code : null
          };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(products, null, 2),
            },
          ],
        };
      }

      case "fishering_add_product": {
        const id = Date.now().toString();
        const price = parseFloat(args.price);
        const originalPrice = args.originalPrice !== undefined ? parseFloat(args.originalPrice) : null;
        const category = args.category || "Geral";
        const store = args.store || "Loja Externa";
        const createdAt = new Date();

        await pool.query(
          "INSERT INTO products (id, title, image, price, originalPrice, url, category, store, coupon, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
          [id, args.title, args.image, price, originalPrice, args.url, category, store, createdAt]
        );

        return {
          content: [
            {
              type: "text",
              text: `Product '${args.title}' added successfully with ID: ${id}`,
            },
          ],
        };
      }

      case "fishering_delete_product": {
        const [result] = await pool.query("DELETE FROM products WHERE id = ?", [args.id]);

        if (result.affectedRows === 0) {
          throw new Error(`Product with ID ${args.id} not found.`);
        }

        return {
          content: [
            {
              type: "text",
              text: `Product with ID ${args.id} deleted successfully.`,
            },
          ],
        };
      }

      case "fishering_list_coupons": {
        const [rows] = await pool.query("SELECT * FROM coupons");
        const coupons = rows.map(r => ({
          ...r,
          value: parseFloat(r.value),
          maxDiscount: r.maxDiscount !== null ? parseFloat(r.maxDiscount) : null,
          minProductPrice: r.minProductPrice !== null ? parseFloat(r.minProductPrice) : 0.00
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(coupons, null, 2),
            },
          ],
        };
      }

      case "fishering_add_coupon": {
        const code = args.code.trim().toUpperCase();
        const value = parseFloat(args.value);
        const maxDiscount = args.maxDiscount !== undefined ? parseFloat(args.maxDiscount) : null;
        const minProductPrice = args.minProductPrice !== undefined ? parseFloat(args.minProductPrice) : 0.00;

        await pool.query(
          "INSERT INTO coupons (code, type, value, maxDiscount, minProductPrice) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE type = ?, value = ?, maxDiscount = ?, minProductPrice = ?",
          [code, args.type, value, maxDiscount, minProductPrice, args.type, value, maxDiscount, minProductPrice]
        );

        return {
          content: [
            {
              type: "text",
              text: `Coupon '${code}' saved successfully.`,
            },
          ],
        };
      }

      case "fishering_delete_coupon": {
        const code = args.code.trim().toUpperCase();
        const [result] = await pool.query("DELETE FROM coupons WHERE code = ?", [code]);

        if (result.affectedRows === 0) {
          throw new Error(`Coupon '${code}' not found.`);
        }

        return {
          content: [
            {
              type: "text",
              text: `Coupon '${code}' deleted successfully.`,
            },
          ],
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing tool '${name}': ${err.message}`,
        },
      ],
    };
  }
});

// Run Stdio transport server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Fishering MCP server is listening on stdio.");
