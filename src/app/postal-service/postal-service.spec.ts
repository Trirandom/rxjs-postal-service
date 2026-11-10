import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PostalService } from './postal-service';

describe('PostalService', () => {
    let component: PostalService;
    let fixture: ComponentFixture<PostalService>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [PostalService],
        }).compileComponents();

        fixture = TestBed.createComponent(PostalService);
        component = fixture.componentInstance;
        await fixture.whenStable();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
