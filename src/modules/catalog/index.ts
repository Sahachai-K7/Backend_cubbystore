import { Elysia } from 'elysia'
import { publicCategories, adminCategories } from './categories'
import { adminProducts } from './products'
import { adminStock } from './stock'
import { publicProducts } from './public'

export const catalogModule = new Elysia({ name: 'catalog' })
  .use(publicCategories)
  .use(publicProducts)
  .use(adminCategories)
  .use(adminProducts)
  .use(adminStock)
