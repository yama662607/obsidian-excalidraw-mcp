import { ExcalidrawMcpError } from "@core/types";
import { describe, expect, it } from "vitest";
import { buildWikiLink, parseWikiLink } from "./links";

describe("WikiLink Parser", () => {
	describe("parseWikiLink", () => {
		it("should parse simple file link", () => {
			const parsed = parseWikiLink("[[FileName]]");
			expect(parsed.targetPath).toBe("FileName");
			expect(parsed.alias).toBeUndefined();
			expect(parsed.subpath).toBeUndefined();
		});

		it("should parse path with extension", () => {
			const parsed = parseWikiLink("[[folder/File Name.md]]");
			expect(parsed.targetPath).toBe("folder/File Name.md");
		});

		it("should parse link with alias", () => {
			const parsed = parseWikiLink("[[FileName|Display Name]]");
			expect(parsed.targetPath).toBe("FileName");
			expect(parsed.alias).toBe("Display Name");
			expect(parsed.subpath).toBeUndefined();
		});

		it("should parse link with heading subpath", () => {
			const parsed = parseWikiLink("[[FileName#Heading 1]]");
			expect(parsed.targetPath).toBe("FileName");
			expect(parsed.subpath).toBe("#Heading 1");
			expect(parsed.alias).toBeUndefined();
		});

		it("should parse link with block ref subpath", () => {
			const parsed = parseWikiLink("[[FileName#^block-id]]");
			expect(parsed.targetPath).toBe("FileName");
			expect(parsed.subpath).toBe("#^block-id");
		});

		it("should parse link with both subpath and alias", () => {
			const parsed = parseWikiLink("[[FileName#Heading|Display Name]]");
			expect(parsed.targetPath).toBe("FileName");
			expect(parsed.subpath).toBe("#Heading");
			expect(parsed.alias).toBe("Display Name");
		});

		it("should handle weird spaces", () => {
			const parsed = parseWikiLink("[[  target  #  heading  |  alias  ]]");
			expect(parsed.targetPath).toBe("target");
			expect(parsed.subpath).toBe("#  heading");
			expect(parsed.alias).toBe("alias");
		});

		it("should throw on invalid format", () => {
			expect(() => parseWikiLink("not a link")).toThrowError(
				ExcalidrawMcpError,
			);
			expect(() => parseWikiLink("[[missing end bracket")).toThrow();
			expect(() => parseWikiLink("missing start bracket]]")).toThrow();
		});
	});

	describe("buildWikiLink", () => {
		it("should build simple file link", () => {
			expect(buildWikiLink("FileName")).toBe("[[FileName]]");
		});

		it("should build link with alias", () => {
			expect(buildWikiLink("FileName", "Alias")).toBe("[[FileName|Alias]]");
		});

		it("should build link with subpath", () => {
			expect(buildWikiLink("FileName", undefined, "heading")).toBe(
				"[[FileName#heading]]",
			);
			expect(buildWikiLink("FileName", undefined, "#heading")).toBe(
				"[[FileName#heading]]",
			);
		});

		it("should build link with both", () => {
			expect(buildWikiLink("FileName", "Alias", "heading")).toBe(
				"[[FileName#heading|Alias]]",
			);
		});
	});
});
