#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
/**
 * Very basic CLI test to ensure the MCP Server class can be instantiated
 * and tools can be listed via the SDK connection.
 *
 * NOTE: This is an internal test and uses the mock Server implementation
 * to avoid real Stdio blocking.
 */
import { server } from "../src/server";

async function run() {
	console.log("Registered Tools:");
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();

	// Connect the server
	await server.connect(serverTransport);

	// Connect a mock client
	const client = new Client(
		{ name: "test-client", version: "1.0.0" },
		{ capabilities: {} },
	);
	await client.connect(clientTransport);

	const tools = await client.listTools();

	console.log("--- Tools List ---");
	for (const t of tools.tools || []) {
		console.log(`- ${t.name}: ${t.description}`);
	}

	process.exit(0);
}

run().catch(console.error);
