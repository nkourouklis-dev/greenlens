import { useParams } from 'react-router-dom'

const Product = () => {
  const { id } = useParams<{ id: string }>()

  return <h1>Product Details: {id ?? 'Unknown Product'}</h1>
}

export default Product
