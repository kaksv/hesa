import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const KYC_REVIEW_TOOL = "KYC_REVIEW_TOOL";
const INVOICE_DRAFT_TOOL = "INVOICE_DRAFT_TOOL";

function kycReviewTool() {
  return new DynamicStructuredTool({
    name: KYC_REVIEW_TOOL,
    description:
      "Perform deterministic KYC/AML pre-check for a commercial payment. Use before any transfer.",
    schema: z.object({
      customerName: z.string().min(2),
      countryCode: z.string().length(2),
      walletAddress: z.string().min(4),
      declaredPurpose: z.string().min(5),
      amountHbar: z.number().positive(),
    }),
    func: async (input) => {
      const blockedCountries = new Set(["KP", "IR", "SY"]);
      const normalizedCountry = input.countryCode.toUpperCase();
      const blocked = blockedCountries.has(normalizedCountry);
      const highValue = input.amountHbar > 1000;
      const missingPurpose = input.declaredPurpose.trim().length < 8;

      const reasons = [];
      if (blocked) reasons.push("sanctioned_country");
      if (highValue) reasons.push("high_value_transfer");
      if (missingPurpose) reasons.push("insufficient_business_purpose");

      const decision = reasons.length > 0 ? "REVIEW_REQUIRED" : "APPROVED";
      return JSON.stringify({
        tool: KYC_REVIEW_TOOL,
        decision,
        reasons,
        reviewedAt: new Date().toISOString(),
        customerName: input.customerName,
        walletAddress: input.walletAddress,
      });
    },
  });
}

function invoiceDraftTool() {
  return new DynamicStructuredTool({
    name: INVOICE_DRAFT_TOOL,
    description:
      "Create an enterprise invoice payload used to log payment intent before execution.",
    schema: z.object({
      customerName: z.string().min(2),
      customerAccountId: z.string().min(3),
      serviceDescription: z.string().min(4),
      amountHbar: z.number().positive(),
      dueDateIso: z.string().min(10),
    }),
    func: async (input) => {
      const invoiceId = `INV-${Date.now()}`;
      return JSON.stringify({
        tool: INVOICE_DRAFT_TOOL,
        invoiceId,
        status: "DRAFTED",
        currency: "HBAR",
        lineItem: input.serviceDescription,
        amountHbar: input.amountHbar,
        customerName: input.customerName,
        customerAccountId: input.customerAccountId,
        dueDateIso: input.dueDateIso,
      });
    },
  });
}

export const compliancePlugin = {
  name: "enterprise-compliance-plugin",
  version: "1.0.0",
  description:
    "Enterprise controls: KYC pre-check and invoice drafting before on-chain settlement.",
  tools: () => [kycReviewTool(), invoiceDraftTool()],
};

export const compliancePluginToolNames = {
  KYC_REVIEW_TOOL,
  INVOICE_DRAFT_TOOL,
};
