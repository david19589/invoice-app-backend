import express from "express";
import bodyParser from "body-parser";
import pool from "./db.js";
import cors from "cors";
import { v4 as uuid } from "uuid";

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.get("/inv", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT inv.invoice_id, bf.street_address, bf.city, bf.post_code, bf.country,
             inv.invoice_date, inv.payment_terms, inv.project_description,
             c.clients_name, c.clients_email, c.clients_street_address, 
             c.clients_city, c.clients_post_code, c.clients_country
      FROM bill_from bf
      INNER JOIN invoice inv ON bf.bill_from_id = inv.invoice_id
      INNER JOIN clients c ON inv.invoice_id = c.clients_id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error retrieving list:", err);
    res.status(500).send("Error retrieving list");
  }
});

app.get("/inv/items", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT item_id, item_name, quantity, price FROM items`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error retrieving items list:", err);
    res.status(500).send("Error retrieving items list");
  }
});

app.post("/inv", async (req, res) => {
  const newInv = req.body;
  const invId = uuid();

  try {
    await pool.query("BEGIN");

    const invoiceResult = await pool.query(
      `INSERT INTO invoice (invoice_id, invoice_date, payment_terms, project_description) 
       VALUES ($1, $2, $3, $4) RETURNING invoice_id`,
      [
        invId,
        newInv.invoiceDate,
        newInv.paymentTerms,
        newInv.projectDescription,
      ]
    );
    await pool.query(
      `INSERT INTO bill_from (street_address, city, post_code, country) 
       VALUES ($1, $2, $3, $4)`,
      [
        billFromId,
        newInv.streetAddress,
        newInv.city,
        newInv.postCode,
        newInv.country,
      ]
    );
    await pool.query(
      `INSERT INTO clients (clients_name, clients_email, clients_street_address, clients_city, clients_post_code, clients_country) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        clientId,
        newInv.clientsName,
        newInv.clientsEmail,
        newInv.clientsStreetAddress,
        newInv.clientsCity,
        newInv.clientsPostCode,
        newInv.clientsCountry,
      ]
    );
    await pool.query(
      `INSERT INTO items (item_name, quantity, price) 
       VALUES ($1, $2, $3)`,
      [itemId, newInv.itemName, newInv.quantity, newInv.price]
    );

    await pool.query("COMMIT");
    res.status(201).json({
      success: true,
      message: "Invoice, bill from, clients, and items created successfully",
      invoiceId: invoiceResult.rows[0].invoice_id,
    });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res
      .status(500)
      .json({
        success: false,
        message: "Error adding invoice and related data",
      });
  }
});

app.put("/inv/:id", async (req, res) => {
  const { id } = req.params;
  const newData = req.body;

  try {
    await pool.query("BEGIN");

    // Fetch current data from the database for the invoice
    const existingInvoice = await pool.query(
      `SELECT invoice_date, payment_terms, project_description 
       FROM invoice WHERE invoice_id = $1`,
      [id]
    );
    console.log(existingInvoice.rows[0]);
    const currentInvoiceData = existingInvoice.rows[0];

    // Merge existing data with new data, so we only update fields that are provided
    const mergedInvoiceData = {
      invoiceDate: newData.invoiceDate || currentInvoiceData.invoice_date,
      paymentTerms: newData.paymentTerms || currentInvoiceData.payment_terms,
      projectDescription:
        newData.projectDescription || currentInvoiceData.project_description,
    };

    // Update the invoice table with the merged data
    await pool.query(
      `UPDATE invoice 
       SET invoice_date = $1, payment_terms = $2, project_description = $3
       WHERE invoice_id = $4`,
      [
        mergedInvoiceData.invoiceDate,
        mergedInvoiceData.paymentTerms,
        mergedInvoiceData.projectDescription,
        id,
      ]
    );

    // Fetch existing bill_from data
    const existingBillFrom = await pool.query(
      `SELECT street_address, city, post_code, country 
       FROM bill_from WHERE bill_from_id = $1`,
      [id]
    );

    const currentBillFromData = existingBillFrom.rows[0];

    // Merge bill_from data with new data
    const mergedBillFromData = {
      streetAddress:
        newData.streetAddress || currentBillFromData.street_address,
      city: newData.city || currentBillFromData.city,
      postCode: newData.postCode || currentBillFromData.post_code,
      country: newData.country || currentBillFromData.country,
    };

    // Update the bill_from table
    await pool.query(
      `UPDATE bill_from
       SET street_address = $1, city = $2, post_code = $3, country = $4
       WHERE bill_from_id = $5`,
      [
        mergedBillFromData.streetAddress,
        mergedBillFromData.city,
        mergedBillFromData.postCode,
        mergedBillFromData.country,
        id,
      ]
    );

    // Fetch existing clients data
    const existingClients = await pool.query(
      `SELECT clients_name, clients_email, clients_street_address, clients_city, clients_post_code, clients_country 
       FROM clients WHERE clients_id = (SELECT clients_id FROM invoice WHERE invoice_id = $1)`,
      [id]
    );

    const currentClientsData = existingClients.rows[0];

    // Merge clients data with new data
    const mergedClientsData = {
      clientsName: newData.clientsName || currentClientsData.clients_name,
      clientsEmail: newData.clientsEmail || currentClientsData.clients_email,
      clientsStreetAddress:
        newData.clientsStreetAddress ||
        currentClientsData.clients_street_address,
      clientsCity: newData.clientsCity || currentClientsData.clients_city,
      clientsPostCode:
        newData.clientsPostCode || currentClientsData.clients_post_code,
      clientsCountry:
        newData.clientsCountry || currentClientsData.clients_country,
    };

    // Update the clients table
    await pool.query(
      `UPDATE clients
       SET clients_name = $1, clients_email = $2, clients_street_address = $3,
           clients_city = $4, clients_post_code = $5, clients_country = $6
       WHERE clients_id = (SELECT clients_id FROM invoice WHERE invoice_id = $7)`,
      [
        mergedClientsData.clientsName,
        mergedClientsData.clientsEmail,
        mergedClientsData.clientsStreetAddress,
        mergedClientsData.clientsCity,
        mergedClientsData.clientsPostCode,
        mergedClientsData.clientsCountry,
        id,
      ]
    );

    // Fetch existing items data
    const existingItems = await pool.query(
      `SELECT item_name, quantity, price FROM items WHERE item_id = $1`,
      [id]
    );

    const currentItemsData = existingItems.rows[0];

    // Merge items data with new data
    const mergedItemsData = {
      itemName: newData.itemName || currentItemsData.item_name,
      quantity: newData.quantity || currentItemsData.quantity,
      price: newData.price || currentItemsData.price,
    };

    // Update the items table
    await pool.query(
      `UPDATE items
       SET item_name = $1, quantity = $2, price = $3
       WHERE item_id = $4`,
      [
        mergedItemsData.itemName,
        mergedItemsData.quantity,
        mergedItemsData.price,
        id,
      ]
    );

    await pool.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Invoice and related data updated successfully",
    });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Error updating invoice and related data",
    });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
