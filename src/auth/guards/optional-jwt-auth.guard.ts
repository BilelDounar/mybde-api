import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Variante non bloquante de JwtAuthGuard : authentifie l'utilisateur si un
// token valide est fourni, mais ne rejette jamais la requête (request.user
// vaut simplement null en l'absence / invalidité du token). Utile pour les
// routes publiques dont le contenu est personnalisé quand l'appelant est connu
// (ex. flux événements/actus scopé aux BDE rejoints).
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: any, user: any): TUser {
    return user || null;
  }
}
