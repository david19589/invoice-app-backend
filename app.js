import express from "express";
import bodyParser from "body-parser";
import pool from "./db.js";
import cors from "cors";
import { v4 as uuid } from "uuid";

const app = express();

app.use(cors());
app.use(bodyParser.json());
const port = process.env.PORT || 5000;

app.get("/inv", async (req, res) => {
  try {
    const result = await pool.query(`
   SELECT inv.id, bf.street_address, bf.city, bf.post_code, bf.country,
          inv.invoice_date, inv.payment_terms, inv.project_description, 
			    inv.invoice_status,
          c.clients_name, c.clients_email, c.clients_street_address, 
          c.clients_city, c.clients_post_code, c.clients_country,
			 i.item_name, i.quantity, i.price
      FROM invoice inv
      INNER JOIN bill_from bf ON inv.id = bf.bill_from_id
      INNER JOIN clients c ON inv.id = c.clients_id
	    INNER JOIN items i ON inv.id = i.invoice_id ORDER BY id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error retrieving list:", err);
    res.status(500).send("Error retrieving list");
  }
});

app.post("/inv", async (req, res) => {
  const newInv = req.body;
  const invId = uuid();
  console.log(newInv);
  try {
    await pool.query("BEGIN");

    const invoiceResult = await pool.query(
      `INSERT INTO invoice (id, invoice_date, invoice_status, payment_terms, project_description) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        invId,
        newInv.invoiceDate,
        newInv.invoiceStatus,
        newInv.paymentTerms,
        newInv.projectDescription,
      ]
    );

    await pool.query(
      `INSERT INTO bill_from (bill_from_id, street_address, city, post_code, country) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        invId,
        newInv.streetAddress,
        newInv.city,
        newInv.postCode,
        newInv.country,
      ]
    );
    await pool.query(
      `INSERT INTO clients (clients_id, clients_name, clients_email, clients_street_address, clients_city, clients_post_code, clients_country) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        invId,
        newInv.clientsName,
        newInv.clientsEmail,
        newInv.clientsStreetAddress,
        newInv.clientsCity,
        newInv.clientsPostCode,
        newInv.clientsCountry,
      ]
    );

    await Promise.all(
      req.body.items.map(async (row) => {
        await pool.query(
          `INSERT INTO items (item_name, quantity, price, invoice_id) 
           VALUES ($1, $2, $3, $4)`,
          [row.itemName, row.quantity, row.price, invId]
        );
      })
    );

    await pool.query("COMMIT");
    res.status(201).json({
      success: true,
      message: "Invoice, bill_from, clients, and items created successfully",
      invoiceId: invoiceResult.rows[0].id,
    });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Error adding invoice and related data",
    });
  }
});

app.put("/inv/:id", async (req, res) => {
  const { id } = req.params;
  const newData = req.body;
  console.log(newData);
  try {
    await pool.query("BEGIN");

    // Fetch current data from the database for the invoice
    const existingInvoice = await pool.query(
      `SELECT invoice_date, invoice_status, payment_terms, project_description 
       FROM invoice WHERE id = $1`,
      [id]
    );

    const currentInvoiceData = existingInvoice.rows[0];

    // Merge existing data with new data, so we only update fields that are provided
    const mergedInvoiceData = {
      invoiceDate: newData.invoiceDate || currentInvoiceData.invoice_date,
      invoiceStatus: newData.invoiceStatus || currentInvoiceData.invoice_status,
      paymentTerms: newData.paymentTerms || currentInvoiceData.payment_terms,
      projectDescription:
        newData.projectDescription || currentInvoiceData.project_description,
    };

    // Update the invoice table with the merged data
    await pool.query(
      `UPDATE invoice 
       SET invoice_date = $1, invoice_status = $2, payment_terms = $3, project_description = $4
       WHERE id = $5`,
      [
        mergedInvoiceData.invoiceDate,
        mergedInvoiceData.invoiceStatus,
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
       FROM clients WHERE clients_id = $1`,
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
       WHERE clients_id = $7`,
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
      `SELECT item_name, quantity, price FROM items WHERE invoice_id = $1`,
      [id]
    );

    // Iterate through each item in the request body
    await Promise.all(
      req.body.items.map(async (row, index) => {
        const currentItemsData = existingItems.rows[index];

        // Merge items data with new data
        const mergedItemsData = {
          itemName: row.itemName || currentItemsData.item_name,
          quantity: row.quantity || currentItemsData.quantity,
          price: row.price || currentItemsData.price,
        };

        // Update the items table
        await pool.query(
          `UPDATE items
         SET item_name = $1, quantity = $2, price = $3
         WHERE invoice_id = $4`,
          [
            mergedItemsData.itemName,
            mergedItemsData.quantity,
            mergedItemsData.price,
            id,
          ]
        );
      })
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

app.delete("/inv/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query("BEGIN");

    await pool.query(`DELETE FROM items WHERE invoice_id = $1`, [id]);
    await pool.query(`DELETE FROM clients WHERE clients_id = $1`, [id]);
    await pool.query(`DELETE FROM bill_from WHERE bill_from_id = $1`, [id]);
    await pool.query(`DELETE FROM invoice WHERE id = $1`, [id]);

    await pool.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Invoice and related data deleted successfully",
    });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("Error deleting invoice:", err);
    res.status(500).json({
      success: false,
      message: "Error deleting invoice and related data",
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
