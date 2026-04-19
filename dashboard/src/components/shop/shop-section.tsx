"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Heart, Filter, Star, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { db } from '@/config/firebase';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';

interface Product {
    id: string;
    name: string;
    description?: string;
    price: number;
    category: string;
    imageUrl?: string;
    rating?: number;
    isPopular?: boolean;
}

export default function ShopSection() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState("all");

    // Mock data for fallback/demo
    const mockProducts: Product[] = [
        { id: '1', name: 'Rainbow Swirl', category: 'lollipops', price: 2.50, rating: 4.8, isPopular: true, imageUrl: '/placeholder-candy.jpg' },
        { id: '2', name: 'Sour Worms', category: 'gummies', price: 3.99, rating: 4.5, isPopular: true, imageUrl: '/placeholder-candy.jpg' },
        { id: '3', name: 'Dark Truffles', category: 'chocolates', price: 12.00, rating: 5.0, isPopular: false, imageUrl: '/placeholder-candy.jpg' },
        { id: '4', name: 'Gummy Bears', category: 'gummies', price: 4.50, rating: 4.2, isPopular: false, imageUrl: '/placeholder-candy.jpg' },
        { id: '5', name: 'Chocolate Bar', category: 'chocolates', price: 1.99, rating: 4.0, isPopular: false, imageUrl: '/placeholder-candy.jpg' },
        { id: '6', name: 'Mega Pop', category: 'lollipops', price: 1.00, rating: 3.8, isPopular: false, imageUrl: '/placeholder-candy.jpg' },
    ];

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                // Try to fetch from Firestore first
                const q = query(collection(db, 'products'), limit(20));
                const querySnapshot = await getDocs(q);

                const fetchedProducts: Product[] = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    fetchedProducts.push({
                        id: doc.id,
                        name: data.name,
                        price: data.price ? Number(data.price) : 0,
                        category: data.category || 'misc',
                        description: data.description,
                        imageUrl: data.images?.[0] || null,
                        ...data
                    } as Product);
                });

                if (fetchedProducts.length > 0) {
                    setProducts(fetchedProducts);
                } else {
                    setProducts(mockProducts);
                }
            } catch (error) {
                console.error("Error fetching products:", error);
                setProducts(mockProducts);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    const filteredProducts = activeCategory === 'all'
        ? products
        : products.filter(p => p.category.toLowerCase() === activeCategory.toLowerCase());

    return (
        <div className="w-full min-h-screen pt-20 pb-10 px-4 md:px-8 bg-gradient-to-b from-pink-50 to-white dark:from-pink-950/20 dark:to-background">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header */}
                <div className="text-center space-y-4 mb-12">
                    <Badge variant="outline" className="px-4 py-1 text-sm border-pink-200 bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800">
                        Sweet Treats
                    </Badge>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 animate-gradient-x pb-2">
                        Candy Wonderland
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Explore our magical collection of handcrafted sweets, gummies, and chocolates.
                        Order now for instant delivery!
                    </p>
                </div>

                {/* Filters */}
                <div className="flex justify-center">
                    <Tabs defaultValue="all" value={activeCategory} onValueChange={setActiveCategory} className="w-full max-w-3xl">
                        <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-white/50 backdrop-blur-sm border shadow-sm dark:bg-black/20">
                            <TabsTrigger value="all" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white py-2">All Sweets</TabsTrigger>
                            <TabsTrigger value="gummies" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white py-2">Gummies</TabsTrigger>
                            <TabsTrigger value="chocolates" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white py-2">Chocolates</TabsTrigger>
                            <TabsTrigger value="lollipops" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white py-2">Lollipops</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {/* Product Grid */}
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="h-12 w-12 animate-spin text-pink-500" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredProducts.map((product) => (
                            <Card key={product.id} className="group overflow-hidden border-none shadow-md hover:shadow-xl transition-all duration-300 bg-white/80 dark:bg-card hover:-translate-y-1">
                                <div className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-muted">
                                    {product.isPopular && (
                                        <Badge className="absolute top-2 right-2 z-10 bg-yellow-400 text-yellow-900 hover:bg-yellow-500 pointer-events-none">
                                            <Star className="w-3 h-3 mr-1 fill-current" /> Popular
                                        </Badge>
                                    )}
                                    {product.imageUrl ? (
                                        <div className="w-full h-full bg-cover bg-center group-hover:scale-110 transition-transform duration-500"
                                            style={{ backgroundImage: `url('${product.imageUrl}')` }}></div>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-4xl font-bold bg-pink-100 dark:bg-pink-900/20">
                                            🍬
                                        </div>
                                    )}
                                    <Button size="icon" variant="secondary" className="absolute bottom-2 right-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0">
                                        <Heart className="w-4 h-4 text-pink-500" />
                                    </Button>
                                </div>
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg font-bold line-clamp-1">{product.name}</CardTitle>
                                            <span className="text-xs text-muted-foreground capitalize">{product.category}</span>
                                        </div>
                                        <div className="text-lg font-bold text-pink-600 dark:text-pink-400">
                                            ${product.price ? product.price.toFixed(2) : '0.00'}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardFooter className="p-4 pt-0">
                                    <Button className="w-full bg-pink-600 hover:bg-pink-700 text-white rounded-full transition-colors group-hover:shadow-pink-500/25">
                                        <ShoppingCart className="w-4 h-4 mr-2" />
                                        Add to Cart
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}

                {filteredProducts.length === 0 && !loading && (
                    <div className="text-center py-20 text-muted-foreground">
                        <Filter className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p className="text-xl">No sweets found in this category.</p>
                        <Button variant="link" onClick={() => setActiveCategory('all')}>View all products</Button>
                    </div>
                )}
            </div>
        </div>
    );
}
