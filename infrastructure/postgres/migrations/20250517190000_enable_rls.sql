-- Enable PostgreSQL Native Row-Level Security (RLS) for Nexus CRM
-- This migration creates RLS policies for core tables across all services.
-- Application-layer RLS via Prisma middleware is still active as a defense-in-depth measure.

-- Helper function to get current tenant from session variable
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_tenant', true);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- CRM Service Tables
-- ============================================

ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_tenant_isolation ON "Account"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_tenant_isolation ON "Contact"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_tenant_isolation ON "Deal"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_tenant_isolation ON "Lead"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_tenant_isolation ON "Activity"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
CREATE POLICY note_tenant_isolation ON "Note"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Pipeline" ENABLE ROW LEVEL SECURITY;
CREATE POLICY pipeline_tenant_isolation ON "Pipeline"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Stage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_tenant_isolation ON "Stage"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "DealContact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_contact_tenant_isolation ON "DealContact"
  USING ("tenantId" = current_tenant_id());

-- ============================================
-- Finance Service Tables
-- ============================================

ALTER TABLE "Quote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_tenant_isolation ON "Quote"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_tenant_isolation ON "Invoice"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Contract" ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_tenant_isolation ON "Contract"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_tenant_isolation ON "Payment"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_tenant_isolation ON "Product"
  USING ("tenantId" = current_tenant_id());

-- ============================================
-- Workflow Service Tables
-- ============================================

ALTER TABLE "WorkflowTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_template_tenant_isolation ON "WorkflowTemplate"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "WorkflowExecution" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_execution_tenant_isolation ON "WorkflowExecution"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "WorkflowStep" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_step_tenant_isolation ON "WorkflowStep"
  USING ("tenantId" = current_tenant_id());

-- ============================================
-- Auth Service Tables
-- ============================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_tenant_isolation ON "User"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_tenant_isolation ON "Session"
  USING ("tenantId" = current_tenant_id());

-- ============================================
-- Approval Service Tables
-- ============================================

ALTER TABLE "ApprovalPolicy" ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_policy_tenant_isolation ON "ApprovalPolicy"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "ApprovalRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_request_tenant_isolation ON "ApprovalRequest"
  USING ("tenantId" = current_tenant_id());

-- ============================================
-- Integration Service Tables
-- ============================================

ALTER TABLE "WebhookSubscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_subscription_tenant_isolation ON "WebhookSubscription"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "WebhookDelivery" ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_delivery_tenant_isolation ON "WebhookDelivery"
  USING ("tenantId" = current_tenant_id());

-- ============================================
-- Reporting Service Tables
-- ============================================

ALTER TABLE "ReportDefinition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_definition_tenant_isolation ON "ReportDefinition"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "SavedReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_report_tenant_isolation ON "SavedReport"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "Dashboard" ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_tenant_isolation ON "Dashboard"
  USING ("tenantId" = current_tenant_id());

ALTER TABLE "DashboardWidget" ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_widget_tenant_isolation ON "DashboardWidget"
  USING ("tenantId" = current_tenant_id());
