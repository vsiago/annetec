'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/auth-context'
import type { Client, Dependent } from '@/lib/types'
import {
  Plus,
  User,
  Calendar,
  CreditCard,
  MoreHorizontal,
  Users,
  Heart,
  Edit,
  Trash2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

export default function DependentesPage() {
  const { user } = useAuth()
  const client = user as Client
  const [isAddOpen, setIsAddOpen] = useState(false)

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const calculateAge = (birthDate: Date) => {
    const today = new Date()
    const birth = new Date(birthDate)
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

  const dependents = client?.dependents || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dependentes</h1>
          <p className="text-muted-foreground">Gerencie os dependentes do seu plano</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#e84364] hover:bg-[#d42d50] text-white">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Dependente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Dependente</DialogTitle>
              <DialogDescription>
                Preencha os dados do novo dependente
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input id="name" placeholder="Nome do dependente" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input id="cpf" placeholder="000.000.000-00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birthDate">Data de Nascimento</Label>
                  <Input id="birthDate" type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="relationship">Parentesco</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="filho">Filho(a)</SelectItem>
                    <SelectItem value="conjuge">Cônjuge</SelectItem>
                    <SelectItem value="pai">Pai</SelectItem>
                    <SelectItem value="mae">Mãe</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-[#e84364] hover:bg-[#d42d50] text-white">
                  Adicionar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Card */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-[#26365f] to-[#2a4a8f] text-white">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-white/10">
              <Users className="h-8 w-8" />
            </div>
            <div>
              <p className="text-white/80 text-sm">Total de Dependentes</p>
              <p className="text-3xl font-bold">{dependents.length}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-white/60 text-sm">Seu plano permite</p>
              <p className="font-medium">Até 5 dependentes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dependents List */}
      {dependents.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {dependents.map((dependent, index) => (
            <Card key={dependent.id} className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14 bg-[#26365f]">
                    <AvatarFallback className="bg-[#26365f] text-white">
                      {getInitials(dependent.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{dependent.name}</h3>
                        <Badge variant="outline" className="mt-1">
                          <Heart className="h-3 w-3 mr-1" />
                          {dependent.relationship}
                        </Badge>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Ver Carteirinha
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        CPF: {dependent.cpf}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {calculateAge(dependent.birthDate)} anos ({new Date(dependent.birthDate).toLocaleDateString('pt-BR')})
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Nenhum dependente cadastrado</h3>
            <p className="text-muted-foreground mb-4">
              Adicione seus dependentes para que eles também possam usufruir dos benefícios do plano.
            </p>
            <Button className="bg-[#e84364] hover:bg-[#d42d50] text-white" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Dependente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Informações Importantes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#26365f] mt-1.5 flex-shrink-0" />
              Dependentes têm acesso a todos os benefícios do plano
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#26365f] mt-1.5 flex-shrink-0" />
              Cada dependente receberá sua própria carteirinha digital
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#26365f] mt-1.5 flex-shrink-0" />
              A inclusão de dependentes pode alterar o valor mensal do plano
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#26365f] mt-1.5 flex-shrink-0" />
              Para dependentes menores de idade, o titular é responsável pelo uso dos benefícios
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
