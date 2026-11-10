import { Component } from '@angular/core';
import { PostalService } from './postal-service/postal-service';

@Component({
  imports: [PostalService],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}
