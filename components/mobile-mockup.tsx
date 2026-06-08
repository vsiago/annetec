"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface MockupItem {
  id: string
  title: string
  description?: string
  icon: LucideIcon
  color: string // Tailwind bg color class (e.g. bg-[#e84364])
}

export interface MobileMockupProps {
  items: MockupItem[]
  activeCategory?: number // If controlled by parent component
  onChangeCategory?: (index: number) => void // Callback when autoPlay cycles the active category
  autoPlay?: boolean // Enable automatic cycling when in uncontrolled mode
  intervalMs?: number // Delay between cycles in ms (default 4000)
  logoSrc?: string // Path to the logo image (default "/annetec-vertical.svg")
  buttonText?: string // CTA button text (default "Acessar Benefício")
  buttonColor?: string // Tailwind bg class for the CTA button (default "bg-[#e84364]")
  frameColor?: string // Tailwind bg class for the device frame (default "bg-[#26365f]")
  className?: string // Additional CSS classes for positioning the outer container
}

export function MobileMockup({
  items,
  activeCategory,
  onChangeCategory,
  autoPlay = true,
  intervalMs = 4000,
  logoSrc = "/annetec-vertical.svg",
  buttonText = "Acessar Benefício",
  buttonColor = "bg-[#e84364]",
  frameColor = "bg-[#26365f]",
  className,
}: MobileMockupProps) {
  // If activeCategory is provided, we act in controlled mode. Otherwise, uncontrolled.
  const isControlled = activeCategory !== undefined
  const [internalIndex, setInternalIndex] = useState(0)

  const currentIndex = isControlled ? activeCategory : internalIndex
  const activeItem = items[currentIndex]

  useEffect(() => {
    if (!autoPlay || isControlled) return

    const interval = setInterval(() => {
      const nextIndex = (currentIndex + 1) % items.length
      setInternalIndex(nextIndex)
      if (onChangeCategory) {
        onChangeCategory(nextIndex)
      }
    }, intervalMs)

    return () => clearInterval(interval)
  }, [autoPlay, isControlled, currentIndex, items.length, intervalMs, onChangeCategory])

  if (!activeItem) return null

  const colorName = activeItem.color.replace("bg-", "")
  const dynamicShadowClass = `shadow-${colorName}/30`

  return (
    <div
      className={cn(
        "w-[240px] h-[490px] rounded-[2.5rem] p-2.5 shadow-2xl relative select-none",
        frameColor,
        className
      )}
    >
      <div className="w-full h-full bg-white rounded-[2rem] overflow-hidden flex flex-col relative">
        <div className="p-5 bg-gradient-to-b from-gray-50 to-white flex-1 flex flex-col items-center">
          {/* Speaker bar */}
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mb-8 mx-auto" />
          
          {/* Logo */}
          {logoSrc && (
            <img
              src={logoSrc}
              alt="Logo"
              className="h-16 mb-8 object-contain"
            />
          )}

          {/* Animated content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -10 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center text-center space-y-5"
            >
              <div
                className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-500",
                  activeItem.color,
                  dynamicShadowClass
                )}
              >
                <activeItem.icon className="w-10 h-10" />
              </div>
              <h3 className="font-bold text-[#26365f] text-xl leading-tight px-2">
                {activeItem.title}
              </h3>
              <p className="text-sm text-muted-foreground px-2">
                {activeItem.description || "As melhores opções disponíveis."}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Bottom CTA Button */}
          <div className="mt-auto w-full">
            <div
              className={cn(
                "text-white text-center py-3 rounded-xl text-sm font-bold shadow-md cursor-pointer transition-all hover:opacity-90 active:scale-95",
                buttonColor
              )}
            >
              {buttonText}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
