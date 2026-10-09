ALTER TABLE "DeliveryReview" ADD COLUMN "allocations" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "DeliveryReview" ADD CONSTRAINT "DeliveryReview_allocations_check" CHECK (jsonb_typeof("allocations") = 'array');
