export interface IBillingRepository {
  findInvoice(id: string): Promise<string | null>;
}
