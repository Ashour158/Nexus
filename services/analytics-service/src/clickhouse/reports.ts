/**
 * ClickHouse Analytics Reports
 */

import { ClickHouseClient } from './client.js';

export class AnalyticsReports {
  constructor(private ch: ClickHouseClient) {}

  async getRevenueByPeriod(tenantId: string, period: 'daily' | 'weekly' | 'monthly', startDate: string, endDate: string): Promise<Array<{ period_start: string; revenue: number; deal_count: number }>> {
    const sql = `
      SELECT period_start, sum(revenue) as revenue, sum(deal_count) as deal_count
      FROM nexus_analytics.revenue
      WHERE tenant_id = {tenantId:String} AND period = {period:String} AND period_start BETWEEN {startDate:String} AND {endDate:String}
      GROUP BY period_start
      ORDER BY period_start
    `;
    return this.ch.query(sql, { tenantId, period, startDate, endDate });
  }

  async getDealFunnel(tenantId: string, date: string): Promise<Array<{ stage: string; deal_count: number; total_value: number }>> {
    const sql = `
      SELECT stage, sum(deal_count) as deal_count, sum(total_value) as total_value
      FROM nexus_analytics.deal_funnel
      WHERE tenant_id = {tenantId:String} AND date = {date:String}
      GROUP BY stage
      ORDER BY stage
    `;
    return this.ch.query(sql, { tenantId, date });
  }

  async getUserActivity(tenantId: string, userId: string, startDate: string, endDate: string): Promise<Array<{ date: string; login_count: number; actions_count: number }>> {
    const sql = `
      SELECT date, sum(login_count) as login_count, sum(actions_count) as actions_count
      FROM nexus_analytics.user_activity
      WHERE tenant_id = {tenantId:String} AND user_id = {userId:String} AND date BETWEEN {startDate:String} AND {endDate:String}
      GROUP BY date
      ORDER BY date
    `;
    return this.ch.query(sql, { tenantId, userId, startDate, endDate });
  }

  async getTopEvents(tenantId: string, eventType: string, limit: number = 10): Promise<Array<{ resource_type: string; count: number }>> {
    const sql = `
      SELECT resource_type, count() as count
      FROM nexus_analytics.events
      WHERE tenant_id = {tenantId:String} AND event_type = {eventType:String}
      GROUP BY resource_type
      ORDER BY count DESC
      LIMIT {limit:UInt32}
    `;
    return this.ch.query(sql, { tenantId, eventType, limit });
  }
}
