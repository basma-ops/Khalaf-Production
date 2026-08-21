import { useListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users as UsersIcon, Mail, Phone } from "lucide-react";

export default function Users() {
  const { data: users, isLoading } = useListUsers();

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-8 w-48 mb-6" /><div className="grid grid-cols-3 gap-6"><Skeleton className="h-40" /><Skeleton className="h-40" /></div></div>;
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin": return <Badge className="bg-primary text-primary-foreground">Admin</Badge>;
      case "manager": return <Badge className="bg-blue-600">Manager</Badge>;
      case "supervisor": return <Badge className="bg-emerald-600">Supervisor</Badge>;
      case "field_worker": return <Badge variant="secondary">Field Worker</Badge>;
      default: return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <UsersIcon className="h-6 w-6 text-primary" />
          Team Roster
        </h1>
        <p className="text-muted-foreground mt-2">Manage access and roles for the intelligence platform.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users?.map((user) => (
          <Card key={user.id} className={!user.active ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{user.name}</CardTitle>
                {getRoleBadge(user.role)}
              </div>
              {!user.active && <span className="text-xs text-destructive">Inactive Account</span>}
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                {user.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span>{user.email}</span>
                  </div>
                )}
                {user.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span>{user.phone}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
