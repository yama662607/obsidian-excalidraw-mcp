/**
 * Environment configuration for the MCP Server.
 */
export const config = {
	// Vault path can be provided via environment variable OR command line argument
	vaultPath: process.env.OBSIDIAN_VAULT_PATH || getVaultArg(),
};

function getVaultArg(): string | undefined {
	const args = process.argv.slice(2);
	const vaultIndex = args.indexOf("--vault");
	if (vaultIndex !== -1 && vaultIndex + 1 < args.length) {
		return args[vaultIndex + 1];
	}
	return undefined;
}
