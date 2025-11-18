# TODO: Correct TypeScript Errors in telegram.service.ts

- [ ] Update prisma/schema.prisma: Add expiryDate DateTime?, renewalDate DateTime?, status String? @default("active") to Subscription model.
- [ ] Update src/services/telegram.service.ts: Change sub.name to sub.product in the message strings.
- [ ] Run prisma migrate dev --name add_subscription_fields
- [ ] Run prisma generate
- [ ] Verify no more TypeScript errors.
