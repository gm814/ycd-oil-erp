import { z } from "zod";
export const serviceIntervalInput = z.preprocess(
  value => value === "" || value === undefined ? null : value,
  z.coerce.number().refine(value => value === 5000 || value === 10000).nullable(),
);
