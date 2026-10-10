/**
 * The shape of a helping task and its shopping items, as the job screens read them.
 */


export type Item = { _id: string; name: string; quantity: number; status: string; preferredBrand?: string; preferredVariant?: string; maxApprovedPricePaise?: number };

export type Task = { _id: string; status: string; serviceType: string; title?: string; reference?: string; items?: Item[]; approvals?: { status: string }[];
  instructions?: string; onSite?: object; itemMoney?: { paymentModel?: string }; returnDetail?: { merchantInstructions?: string };
  pickupLocation?: object; paymentMethod?: string; customerRating?: { stars?: number } };
