/** Default user (matches backend seed `users` table). Can be replaced with auth later. */
export const DEFAULT_USER_ID = process.env.NEXT_PUBLIC_DEFAULT_USER_ID ?? 'system'

/** Segmentation model shown in the UI and the PDF report; set to match --seg-model of the pipeline
 *  (e.g. NEXT_PUBLIC_SEG_MODEL_LABEL=DualHeadUNet). */
export const SEG_MODEL_LABEL = process.env.NEXT_PUBLIC_SEG_MODEL_LABEL ?? 'SegFormer'
